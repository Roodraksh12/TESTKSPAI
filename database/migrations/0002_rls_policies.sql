alter table districts enable row level security;
alter table police_stations enable row level security;
alter table officers enable row level security;
alter table cases enable row level security;
alter table persons enable row level security;
alter table case_persons enable row level security;
alter table connections enable row level security;
alter table case_matches enable row level security;
alter table chat_sessions enable row level security;
alter table chat_messages enable row level security;
alter table audit_logs enable row level security;
alter table alerts enable row level security;
alter table feedback enable row level security;

create policy "officers can read own profile"
  on officers for select
  using (auth_user_id = auth.uid());

create policy "authenticated can read districts"
  on districts for select
  to authenticated
  using (true);

create policy "authenticated can read stations"
  on police_stations for select
  to authenticated
  using (true);

create policy "officers can read own audit logs"
  on audit_logs for select
  to authenticated
  using (
    officer_id in (
      select id from officers where auth_user_id = auth.uid()
    )
  );

create policy "officers can read station cases"
  on cases for select
  to authenticated
  using (
    station_id in (
      select station_id from officers where auth_user_id = auth.uid()
    )
    or exists (
      select 1 from officers where auth_user_id = auth.uid() and role = 'SP'
    )
  );

create policy "officers can read station alerts"
  on alerts for select
  to authenticated
  using (
    station_id in (
      select station_id from officers where auth_user_id = auth.uid()
    )
    or exists (
      select 1 from officers where auth_user_id = auth.uid() and role = 'SP'
    )
  );

