{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.performance = {
    id = { type = "integer"; pk = true; auto = true; };
    title = { type = "text"; required = true; };
    venue_id = { type = "integer"; required = true; references = "venue(id)"; };
    date = { type = "text"; required = true; };
    time = { type = "text"; required = true; };
    duration_mins = { type = "integer"; required = true; };
    description = { type = "text"; };
    status = { type = "text"; default = "'scheduled'"; };  # scheduled, cancelled, completed
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  # Junction table for performance-artist many-to-many
  tables.performance_artist = {
    id = { type = "integer"; pk = true; auto = true; };
    performance_id = { type = "integer"; required = true; references = "performance(id)"; };
    artist_id = { type = "integer"; required = true; references = "artist(id)"; };
    role_in_performance = { type = "text"; };  # Character name or role
  };

  operations.performance = {
    cancel = {
      guard = E.eq (E.f "status") (E.lit "scheduled");
      set = { status = "cancelled"; };
      cascade = [{
        entity = "ticket";
        via = "performance_id";
        set = { status = "cancelled"; };
      }];
      effects = [
        { notify = { channel = "email"; template = "performance_cancelled"; to = "ticket_holders"; }; }
      ];
    };

    complete = {
      guard = E.eq (E.f "status") (E.lit "scheduled");
      set = { status = "completed"; };
    };

    reschedule = {
      guard = E.eq (E.f "status") (E.lit "scheduled");
      # Note: actual date/time comes from input, not hardcoded
      set = {};  # Fields set from input
      effects = [
        { notify = { channel = "email"; template = "performance_rescheduled"; to = "ticket_holders"; }; }
      ];
    };
  };
}
