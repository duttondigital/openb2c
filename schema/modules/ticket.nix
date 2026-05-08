{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
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

  authorization.ticket = {
    ownerFields = [ "user_id" ];
    read.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "ticket.read" "read" ])
      (A.scopedAny [ "ticket.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "ticket.create" "write" ])
      (A.scopedAny [ "ticket.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "ticket.update" "write" ])
      (A.scopedAny [ "ticket.update" "write" ])
    ];
    delete.allow = [
      A.operator
      (A.ownerService [ "ticket.delete" "write" ])
      (A.scopedAny [ "ticket.delete" ])
    ];
    operations = {
      confirm.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "ticket.confirm" "write" ])
        (A.scopedAny [ "ticket.confirm" ])
      ];
      cancel.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "ticket.cancel" "write" ])
        (A.scopedAny [ "ticket.cancel" ])
      ];
      use.allow = [
        A.operator
        (A.scopedAny [ "ticket.use" ])
      ];
      upgrade.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "ticket.upgrade" "write" ])
        (A.scopedAny [ "ticket.upgrade" ])
      ];
    };
  };
}
