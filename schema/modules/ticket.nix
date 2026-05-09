{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.ticket = {
    id = { type = "integer"; pk = true; auto = true; };
    performance_id = { type = "integer"; required = true; references = "performance(id)"; };
    user_id = { type = "integer"; required = true; references = "user(id)"; };
    seat = { type = "text"; };
    price_pence = { type = "integer"; required = true; };
    ticket_type = { type = "text"; default = "'standard'"; };  # standard, vip, concession
    status = { type = "text"; default = "'reserved'"; };  # reserved, confirmed, cancelled, used
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  indexes.ticket.by_user_status = {
    columns = [ "user_id" "status" ];
  };

  indexes.ticket.by_performance_status = {
    columns = [ "performance_id" "status" ];
  };

  operations.ticket = {
    confirm = {
      guard = E.and
        (E.eq (E.f "status") (E.lit "reserved"))
        # Can't confirm if performance is cancelled
        (E.ne (E.rel "performance" "status") (E.lit "cancelled"));
      set = { status = "confirmed"; };
      effects = [
        { notify = { channel = "email"; template = "ticket_confirmation"; }; }
      ];
    };

    cancel = {
      guard = E.or
        (E.eq (E.f "status") (E.lit "reserved"))
        (E.eq (E.f "status") (E.lit "confirmed"));
      set = { status = "cancelled"; };
    };

    use = {
      relationships = [];
      guard = E.and
        (E.eq (E.f "status") (E.lit "confirmed"))
        (E.eq (E.rel "performance" "status") (E.lit "scheduled"));
      set = { status = "used"; };
    };

    upgrade = {
      guard = E.and
        (E.eq (E.f "ticket_type") (E.lit "standard"))
        (E.eq (E.f "status") (E.lit "confirmed"));
      set = { ticket_type = "vip"; };
    };
  };
}
