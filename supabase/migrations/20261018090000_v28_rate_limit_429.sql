-- v28: rate-limit errors used SQLSTATE P0429, which PostgREST reports as HTTP 500. PTxxx codes map to HTTP xxx,
-- so PT429 gives clients a proper 429 Too Many Requests with the same message.
do $$ begin
  execute replace(pg_get_functiondef('public.fp_rate_limit'::regproc), 'P0429', 'PT429');
end $$;
