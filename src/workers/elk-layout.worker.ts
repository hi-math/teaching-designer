/// <reference lib="webworker" />
// 학습 흐름 layout 전용 Worker (사양 §10.2)
// elkjs 의 worker 빌드는 Worker 안에서 실행되면 self.onmessage 에 ELK dispatcher 를 직접 등록한다.
// main thread 쪽은 elkjs/lib/elk-api.js 가 이 Worker 와 메시지를 주고받는다.

import "elkjs/lib/elk-worker.min.js";
