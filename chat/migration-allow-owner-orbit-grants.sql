-- Permit explicitly authorized, auditable owner-issued Orbit grants.
-- Retain the existing reward-reason list and the NOT VALID state of the constraint.
alter table public.orbit_ledger
  drop constraint orbit_ledger_reason_check;

alter table public.orbit_ledger
  add constraint orbit_ledger_reason_check check (
    reason = any (array[
      'event', 'host_event', 'challenge', 'weekly_milestone',
      'tournament', 'time_on_orbit', 'tournament_2nd', 'tournament_3rd',
      'login_streak', 'help', 'bug_report', 'poll', 'staff_event',
      'monthly_milestone', 'member_of_month', 'game', 'spend',
      'orbit_drift', 'gift_out', 'gift_in', 'gamble_bet', 'gamble_fee',
      'gamble_win', 'theft_cost', 'theft_gain', 'theft_loss',
      'game_reward', 'theft_reflect', 'owner_grant'
    ])
  ) not valid;
