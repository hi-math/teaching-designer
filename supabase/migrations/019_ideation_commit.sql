-- Save a draft or apply a reviewed topic in one transaction.
-- Invoker security retains RLS; only the lesson owner can commit selections.
create or replace function public.commit_ideation(
  p_lesson_id uuid, p_changes jsonb, p_expected jsonb
) returns void language plpgsql security invoker set search_path = public as $$
declare
  v_code text;
  v_content jsonb;
  v_current jsonb;
  v_created boolean;
begin
  if auth.uid() is null or not exists (
    select 1 from public.lessons where id = p_lesson_id and owner_id = auth.uid()
  ) then raise insufficient_privilege using message = 'Only the lesson owner can commit ideation'; end if;
  if jsonb_typeof(p_changes) is distinct from 'object' or jsonb_typeof(p_expected) is distinct from 'object'
  then raise exception 'Invalid changes'; end if;
  for v_code, v_content in select key, value from jsonb_each(p_changes) order by key loop
    if v_code not in ('__ideation', '__selected_standards', 'A-2', 'A-3', 'A-4') or not (p_expected ? v_code)
    then raise exception 'Invalid activity'; end if;
    -- Insert a placeholder to lock even previously absent rows. Any error rolls it back.
    v_created := false;
    insert into public.activity_contents (lesson_id, activity_code, content, updated_by)
      values (p_lesson_id, v_code, '{}'::jsonb, auth.uid())
      on conflict (lesson_id, activity_code) do nothing returning true into v_created;
    select content into v_current from public.activity_contents
      where lesson_id = p_lesson_id and activity_code = v_code for update;
    if coalesce(v_created, false) then v_current := 'null'::jsonb;
    elsif v_current->>'type' = 'structured' then v_current := v_current->'fields'; end if;
    if v_current is distinct from p_expected->v_code then raise exception 'Ideation conflict'; end if;
    -- Preserve the current completion status, even if it changed after preview.
    update public.activity_contents set
      content = case when content ? 'status' and v_content->>'type' = 'structured'
        then v_content || jsonb_build_object('status', content->'status') else v_content end,
      updated_by = auth.uid()
      where lesson_id = p_lesson_id and activity_code = v_code;
  end loop;
end;
$$;
revoke all on function public.commit_ideation(uuid, jsonb, jsonb) from public;
grant execute on function public.commit_ideation(uuid, jsonb, jsonb) to authenticated;
