-- ============================================================================
-- Hotel Operations App — Database Schema (Supabase / Postgres)
-- Run this once in your Supabase project's SQL Editor (Project > SQL Editor > New query)
-- ============================================================================

-- ----------------------------------------------------------------------------
-- ENUMS
-- ----------------------------------------------------------------------------
create type user_role as enum (
  'front_desk',
  'housekeeping_staff',
  'housekeeping_supervisor',
  'maintenance_staff',
  'general_manager'
);

create type cleaning_status as enum (
  'checked_out', 'cleaning_in_progress', 'pending_inspection', 'clean_ready'
);

create type operational_status as enum ('active', 'blocked', 'out_of_service');
create type task_type as enum ('checkout_turnover', 'in_house');
create type task_status as enum ('not_started', 'in_progress', 'pending_inspection', 'completed', 'rejected');
create type inspection_result as enum ('approved', 'rejected');
create type rejection_route as enum ('same_staff', 'general_queue');
create type ticket_type as enum ('maintenance', 'housekeeping');
create type ticket_status as enum ('reported', 'assigned', 'in_progress', 'completed', 'verified');
create type ticket_priority as enum ('normal', 'escalated', 'high');
create type guest_approval_status as enum ('approved_while_away', 'defer_until_checkout', 'not_applicable', 'pending');
create type gm_decision_type as enum ('assigned_department', 'override_ready', 'external_escalation');
create type lost_found_status as enum ('reported', 'held', 'closed');
create type supply_status as enum ('open', 'assigned', 'fulfilled');

-- ----------------------------------------------------------------------------
-- PROFILES  (extends Supabase auth.users with hotel-specific role info)
-- ----------------------------------------------------------------------------
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null,
  role user_role not null,
  phone text,
  active boolean not null default true,
  must_change_password boolean not null default true,
  created_at timestamptz not null default now()
);

-- Helper: current user's role, used throughout RLS policies below
create or replace function current_role_name() returns user_role
language sql stable as $$
  select role from profiles where id = auth.uid()
$$;

-- ----------------------------------------------------------------------------
-- ZONES  (GM-managed structure)
-- ----------------------------------------------------------------------------
create table zones (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  created_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- ROOMS
-- ----------------------------------------------------------------------------
create table rooms (
  id uuid primary key default gen_random_uuid(),
  number text not null unique,
  floor text,
  zone_id uuid references zones(id),
  cleaning_status cleaning_status not null default 'clean_ready',
  operational_status operational_status not null default 'active',
  dnd_flag boolean not null default false,
  priority_flag boolean not null default false,
  priority_reason text,
  priority_set_by uuid references profiles(id),
  priority_set_at timestamptz,
  priority_requested_staff uuid references profiles(id),
  blocked_reason text,
  blocked_by uuid references profiles(id),
  blocked_at timestamptz,
  expected_release_at timestamptz,
  linked_maintenance_ticket_id uuid,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- CLEANING TASKS
-- ----------------------------------------------------------------------------
create table cleaning_tasks (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references rooms(id),
  task_type task_type not null default 'checkout_turnover',
  assigned_staff uuid references profiles(id),
  status task_status not null default 'not_started',
  cleaning_started_at timestamptz,
  cleaning_ended_at timestamptz,
  duration_minutes numeric,
  excess_duration_flag boolean not null default false,
  inspected_by uuid references profiles(id),
  inspection_result inspection_result,
  rejection_note text,
  rejection_route rejection_route,
  supervisor_note text,
  linked_maintenance_ticket_id uuid,
  reverted_by uuid references profiles(id),
  revert_reason text,
  aborted_duration_seconds numeric,
  priority_flag boolean not null default false,
  priority_reason text,
  priority_set_by uuid references profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- MAINTENANCE TICKETS
-- ----------------------------------------------------------------------------
create table maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  description text not null,
  photo_url text,
  ticket_type ticket_type not null default 'maintenance',
  priority ticket_priority not null default 'normal',
  reported_by uuid references profiles(id),
  reported_by_role user_role,
  room_occupancy_at_report text check (room_occupancy_at_report in ('occupied','vacant')),
  guest_approval_status guest_approval_status not null default 'not_applicable',
  guest_approval_confirmed_by uuid references profiles(id),
  guest_approval_notes text,
  status ticket_status not null default 'reported',
  assigned_to uuid references profiles(id),
  escalated_at timestamptz,
  notified_roles text[],
  reroute_count integer not null default 0,
  gm_decision gm_decision_type,
  gm_decision_reason text,
  items_used text,
  requires_room_block boolean not null default false,
  aging_notified_1hr boolean not null default false,
  aging_notified_3hr boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table ticket_reroutes (
  id uuid primary key default gen_random_uuid(),
  ticket_id uuid not null references maintenance_tickets(id),
  from_role user_role,
  to_role user_role,
  reason text not null,
  performed_by uuid references profiles(id),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- LOST & FOUND
-- ----------------------------------------------------------------------------
create table lost_found_items (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id),
  photo_url text,
  description text not null,
  found_by uuid references profiles(id),
  status lost_found_status not null default 'reported',
  storage_location text,
  acknowledged_by uuid references profiles(id),
  closed_by uuid references profiles(id),
  closed_reason text check (closed_reason in ('collected','discarded')),
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- SUPPLY REQUESTS
-- ----------------------------------------------------------------------------
create table supply_requests (
  id uuid primary key default gen_random_uuid(),
  item text not null,
  quantity integer not null default 1,
  room_id uuid references rooms(id),
  requested_by uuid references profiles(id),
  assigned_to_staff uuid references profiles(id),
  assigned_to_team text,
  assigned_to_department text,
  status supply_status not null default 'open',
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- STAFF SHIFTS
-- ----------------------------------------------------------------------------
create table staff_shifts (
  id uuid primary key default gen_random_uuid(),
  staff_id uuid references profiles(id),
  shift_date date not null,
  shift_time text,
  zone_id uuid references zones(id),
  created_at timestamptz not null default now(),
  unique (staff_id, shift_date)
);

-- ----------------------------------------------------------------------------
-- NOTIFICATIONS
-- ----------------------------------------------------------------------------
create table notifications (
  id uuid primary key default gen_random_uuid(),
  recipient_id uuid references profiles(id),
  recipient_role user_role,
  event_type text not null,
  entity_type text,
  entity_id uuid,
  message text not null,
  read_at timestamptz,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- IMMUTABLE AUDIT TRAIL  (append-only — no update/delete allowed, even for admins)
-- ----------------------------------------------------------------------------
create table status_log (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  action text not null,
  from_state text,
  to_state text,
  performed_by uuid references profiles(id),
  role user_role,
  device text,
  created_at timestamptz not null default now()
);

-- ============================================================================
-- ROW LEVEL SECURITY
-- ============================================================================
alter table profiles enable row level security;
alter table zones enable row level security;
alter table rooms enable row level security;
alter table cleaning_tasks enable row level security;
alter table maintenance_tickets enable row level security;
alter table ticket_reroutes enable row level security;
alter table lost_found_items enable row level security;
alter table supply_requests enable row level security;
alter table staff_shifts enable row level security;
alter table notifications enable row level security;
alter table status_log enable row level security;

-- Everyone signed in can read their own profile + the staff directory (needed for assignment dropdowns)
create policy "profiles: read all" on profiles for select using (auth.uid() is not null);
create policy "profiles: update own" on profiles for update using (auth.uid() = id);
create policy "profiles: gm update any" on profiles for update using (current_role_name() = 'general_manager');

-- Guard: even though a user can update their own profile row (e.g. to clear must_change_password
-- after setting a new password), only a GM may change role or active status — on ANY row, including
-- their own. This blocks self-escalation regardless of what the client sends.
create or replace function guard_profile_role_changes() returns trigger
language plpgsql as $$
begin
  if (new.role is distinct from old.role or new.active is distinct from old.active)
     and current_role_name() <> 'general_manager' then
    raise exception 'Only a General Manager can change role or active status.';
  end if;
  return new;
end;
$$;

create trigger profiles_guard_role_changes
  before update on profiles
  for each row execute function guard_profile_role_changes();

-- Zones: everyone can view; only GM can create/edit/delete
create policy "zones: read all" on zones for select using (auth.uid() is not null);
create policy "zones: gm write" on zones for insert with check (current_role_name() = 'general_manager');
create policy "zones: gm update" on zones for update using (current_role_name() = 'general_manager');
create policy "zones: gm delete" on zones for delete using (current_role_name() = 'general_manager');

-- Rooms: everyone can view.
create policy "rooms: read all" on rooms for select using (auth.uid() is not null);
create policy "rooms: gm insert" on rooms for insert with check (current_role_name() = 'general_manager');
-- Priority flag settable by front desk, supervisor, GM (front desk cannot touch cleaning_status —
-- enforce column-level intent at the application layer; this policy governs row-level write access)
create policy "rooms: priority setters can update" on rooms for update using (
  current_role_name() in ('front_desk','housekeeping_supervisor','general_manager')
);
-- Housekeeping staff may update rooms only to advance their own assigned cleaning task's status
-- (enforced primarily through cleaning_tasks; this policy allows the linked room row to reflect it)
create policy "rooms: housekeeping staff limited update" on rooms for update using (
  current_role_name() = 'housekeeping_staff'
);
create policy "rooms: maintenance can flag block" on rooms for update using (
  current_role_name() = 'maintenance_staff'
);

-- Cleaning tasks
create policy "cleaning_tasks: read all" on cleaning_tasks for select using (auth.uid() is not null);
create policy "cleaning_tasks: staff insert/update own" on cleaning_tasks for insert with check (
  current_role_name() in ('housekeeping_staff','housekeeping_supervisor','general_manager')
);
create policy "cleaning_tasks: staff update own assigned" on cleaning_tasks for update using (
  (current_role_name() = 'housekeeping_staff' and assigned_staff = auth.uid())
  or current_role_name() in ('housekeeping_supervisor','general_manager')
);

-- Maintenance tickets: everyone can create; broader roles can update
create policy "tickets: read all" on maintenance_tickets for select using (auth.uid() is not null);
create policy "tickets: anyone can report" on maintenance_tickets for insert with check (auth.uid() is not null);
create policy "tickets: assignee/supervisor/gm can update" on maintenance_tickets for update using (
  current_role_name() in ('housekeeping_supervisor','general_manager')
  or (current_role_name() = 'maintenance_staff' and assigned_to = auth.uid())
);

create policy "reroutes: read all" on ticket_reroutes for select using (auth.uid() is not null);
create policy "reroutes: supervisor/maintenance/gm can create" on ticket_reroutes for insert with check (
  current_role_name() in ('housekeeping_supervisor','maintenance_staff','general_manager')
);

-- Lost & found
create policy "lostfound: read all" on lost_found_items for select using (auth.uid() is not null);
create policy "lostfound: staff can report" on lost_found_items for insert with check (
  current_role_name() in ('housekeeping_staff','housekeeping_supervisor','general_manager')
);
create policy "lostfound: role-based update" on lost_found_items for update using (
  current_role_name() in ('housekeeping_supervisor','front_desk','general_manager')
);

-- Supply requests: open to everyone
create policy "supply: read all" on supply_requests for select using (auth.uid() is not null);
create policy "supply: anyone can create" on supply_requests for insert with check (auth.uid() is not null);
create policy "supply: anyone can update" on supply_requests for update using (auth.uid() is not null);

-- Staff shifts: everyone reads; only supervisor/GM write
create policy "shifts: read all" on staff_shifts for select using (auth.uid() is not null);
create policy "shifts: supervisor/gm write" on staff_shifts for insert with check (
  current_role_name() in ('housekeeping_supervisor','general_manager')
);
create policy "shifts: supervisor/gm update" on staff_shifts for update using (
  current_role_name() in ('housekeeping_supervisor','general_manager')
);

-- Notifications: users see only their own
create policy "notifications: read own" on notifications for select using (recipient_id = auth.uid());
create policy "notifications: system/anyone can insert" on notifications for insert with check (auth.uid() is not null);
create policy "notifications: mark own read" on notifications for update using (recipient_id = auth.uid());

-- Audit log: everyone can read (transparency); insert allowed for any signed-in action;
-- NO update or delete policy exists for any role — this makes the log immutable.
create policy "status_log: read all" on status_log for select using (auth.uid() is not null);
create policy "status_log: insert own actions" on status_log for insert with check (auth.uid() is not null);

-- ----------------------------------------------------------------------------
-- NOTIFICATION FAN-OUT HELPER
-- Notifications are always stored per-person (recipient_id), never as a bare role —
-- this fans a role-targeted alert out to every active staff member holding it.
-- ----------------------------------------------------------------------------
create or replace function notify_role(
  p_role user_role, p_event_type text, p_entity_type text, p_entity_id uuid, p_message text
) returns void
language plpgsql as $$
begin
  insert into notifications (recipient_id, recipient_role, event_type, entity_type, entity_id, message)
  select id, p_role, p_event_type, p_entity_type, p_entity_id, p_message
  from profiles where role = p_role and active = true;
end;
$$;

-- ----------------------------------------------------------------------------
-- CHECKOUT AUTO-ESCALATION
-- When a room's cleaning_status flips to 'checked_out', any linked ticket that was
-- deferred until checkout escalates to high priority and notifies both departments.
-- ----------------------------------------------------------------------------
create or replace function escalate_deferred_tickets_on_checkout() returns trigger
language plpgsql security definer as $$
declare
  t record;
begin
  if new.cleaning_status = 'checked_out' and old.cleaning_status is distinct from 'checked_out' then
    for t in
      select * from maintenance_tickets
      where room_id = new.id
        and guest_approval_status = 'defer_until_checkout'
        and status not in ('completed', 'verified')
    loop
      update maintenance_tickets
        set priority = 'high', escalated_at = now(), notified_roles = array['housekeeping_supervisor','maintenance_staff']
        where id = t.id;

      perform notify_role('housekeeping_supervisor', 'ticket_escalated_checkout', 'ticket', t.id,
        'Room ' || new.number || ': deferred ticket is now actionable — guest checked out.');
      perform notify_role('maintenance_staff', 'ticket_escalated_checkout', 'ticket', t.id,
        'Room ' || new.number || ': deferred ticket is now actionable — guest checked out.');

      insert into status_log (entity_type, entity_id, action, from_state, to_state)
        values ('ticket', t.id, 'auto_escalated_checkout', 'normal', 'high');
    end loop;
  end if;
  return new;
end;
$$;

create trigger rooms_escalate_deferred_tickets
  after update on rooms
  for each row execute function escalate_deferred_tickets_on_checkout();

-- ----------------------------------------------------------------------------
-- TICKET AGING ALERTS (1 hour -> supervisor, 3 hours -> GM)
-- Runs on a schedule via pg_cron — see the "select cron.schedule(...)" call below.
-- This function is security definer so it can fan out notifications regardless of
-- who (if anyone) is "signed in" when the cron job fires.
-- ----------------------------------------------------------------------------
create or replace function check_ticket_aging() returns void
language plpgsql security definer as $$
declare
  t record;
begin
  for t in
    select * from maintenance_tickets
    where status not in ('completed', 'verified')
  loop
    if now() - t.created_at >= interval '1 hour' and not t.aging_notified_1hr then
      perform notify_role('housekeeping_supervisor', 'ticket_aging_1hr', 'ticket', t.id,
        'A ticket has been open over 1 hour without resolution.');
      update maintenance_tickets set aging_notified_1hr = true where id = t.id;
      insert into status_log (entity_type, entity_id, action) values ('ticket', t.id, 'aging_alert_1hr');
    end if;

    if now() - t.created_at >= interval '3 hours' and not t.aging_notified_3hr then
      perform notify_role('general_manager', 'ticket_aging_3hr', 'ticket', t.id,
        'A ticket has been open over 3 hours without resolution — needs a decision.');
      update maintenance_tickets set aging_notified_3hr = true where id = t.id;
      insert into status_log (entity_type, entity_id, action) values ('ticket', t.id, 'aging_alert_3hr');
    end if;
  end loop;
end;
$$;

-- One-time setup: enable pg_cron (Supabase supports this out of the box) and schedule
-- the aging check to run every 15 minutes. Run this once after everything above.
create extension if not exists pg_cron with schema extensions;
select cron.schedule('ticket-aging-check', '*/15 * * * *', $$select check_ticket_aging();$$);


-- ============================================================================
-- STORAGE BUCKET for photos (issue photos, cleaning photos, lost & found photos)
-- Run separately if the bucket doesn't already exist:
-- ============================================================================
insert into storage.buckets (id, name, public) values ('photos', 'photos', true)
on conflict (id) do nothing;

create policy "photos: public read" on storage.objects for select using (bucket_id = 'photos');
create policy "photos: authenticated upload" on storage.objects for insert with check (
  bucket_id = 'photos' and auth.uid() is not null
);

-- ============================================================================
-- SEED DATA (optional — remove or edit before go-live)
-- ============================================================================
-- insert into zones (name) values ('Floor 1'), ('Floor 2'), ('Floor 3');
-- insert into rooms (number, floor) values ('101','1'), ('102','1'), ('201','2');
