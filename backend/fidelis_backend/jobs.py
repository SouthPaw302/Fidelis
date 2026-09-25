from __future__ import annotations

from concurrent.futures import Future, ThreadPoolExecutor
from typing import Any, Callable

from . import storage


class JobRunner:
    def __init__(self, workers: int = 2) -> None:
        self.pool = ThreadPoolExecutor(max_workers=workers, thread_name_prefix='fidelis')
        self.futures: dict[str, Future] = {}

    def submit(self, project_id: str | None, kind: str, request: dict[str, Any], fn: Callable[[], Any]) -> dict[str, Any]:
        job = storage.create_job(project_id, kind, request)

        def run():
            storage.update_job(job['id'], status='running')
            try:
                result = fn()
            except Exception as exc:
                storage.update_job(job['id'], status='failed', error=f'{type(exc).__name__}: {exc}')
                raise
            storage.update_job(job['id'], status='complete', result=result)
            return result

        self.futures[job['id']] = self.pool.submit(run)
        return job

    def wait(self, job_id: str, timeout: float | None = None) -> dict[str, Any]:
        future = self.futures.get(job_id)
        if future:
            try:
                future.result(timeout=timeout)
            except Exception:
                pass
        return storage.get_job(job_id) or {'id': job_id, 'status': 'missing'}


RUNNER = JobRunner()
