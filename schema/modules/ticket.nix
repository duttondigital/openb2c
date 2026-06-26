{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.ticket = {
    id = { type = "integer"; pk = true; auto = true; };
    performance_id = {
      type = "integer";
      required = true;
      references = "performance(id)";
      metadata = {
        label = "Performance";
        displayPriority = 10;
      };
      relationship = {
        label = "Performance";
        description = "Performance this ticket admits the customer to.";
      };
    };
    user_id = {
      type = "integer";
      required = true;
      references = "user(id)";
      metadata = {
        label = "Customer";
        displayPriority = 20;
      };
      relationship = {
        label = "Customer";
        description = "Customer who owns this ticket.";
      };
    };
    seat = {
      type = "text";
      metadata = {
        label = "Seat";
        placeholder = "A12";
        displayPriority = 30;
      };
      validation.maxLength = 24;
    };
    price_pence = {
      type = "integer";
      required = true;
      metadata = {
        label = "Price";
        format = "money";
        displayPriority = 40;
      };
      validation.minimum = 0;
    };
    ticket_type = {
      type = "text";
      default = "'standard'";
      metadata = {
        label = "Ticket type";
        displayPriority = 50;
      };
      validation.enum = [ "standard" "vip" "concession" ];
    };
    status = {
      type = "text";
      default = "'reserved'";
      metadata = {
        label = "Status";
        displayPriority = 60;
      };
      validation.enum = [ "reserved" "confirmed" "cancelled" "used" ];
    };
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
  };

  indexes.ticket.by_user_status = {
    columns = [ "user_id" "status" ];
  };

  indexes.ticket.by_performance_status = {
    columns = [ "performance_id" "status" ];
  };

  indexes.ticket.unique_performance_seat = {
    columns = [ "performance_id" "seat" ];
    unique = true;
  };

  validations.ticket.vipPriceMinimum = {
    fields = [
      config.refs.ticket.ticket_type
      config.refs.ticket.price_pence
    ];
    expression = E.or
      (E.ne (E.f "ticket_type") (E.lit "vip"))
      (E.gte (E.f "price_pence") (E.lit 2500));
    message = "VIP tickets must cost at least GBP 25.00.";
  };

  audit.entities.ticket = {
    operations = [ "create" "update" "delete" "confirm" "cancel" "use" "upgrade" ];
    category = "workflow";
    reason = "Tickets represent customer entitlements and admission state.";
  };

  workflows.groups.ticketLifecycle = {
    label = "Ticket lifecycle";
    description = "Customer and staff operations that move a ticket from reservation through admission or cancellation.";
    displayPriority = 20;
  };

  operations.ticket = {
    confirm = {
      policy = {
        label = "Confirm ticket";
        description = "Customer or user-bound service confirms a reserved ticket.";
        audiences = [ "customer" "service" ];
      };
      workflow = {
        group = "ticketLifecycle";
        transitions = [{
          field = config.refs.ticket.status;
          from = [ "reserved" ];
          to = "confirmed";
        }];
        audit.summary = "Confirmed ticket";
      };
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
      policy = {
        label = "Cancel ticket";
        audiences = [ "customer" "service" ];
      };
      workflow = {
        group = "ticketLifecycle";
        transitions = [{
          field = config.refs.ticket.status;
          from = [ "reserved" "confirmed" ];
          to = "cancelled";
        }];
        audit.summary = "Cancelled ticket";
        confirmation = {
          required = true;
          title = "Cancel ticket";
          message = "This will cancel the selected ticket.";
          confirmLabel = "Cancel ticket";
          severity = "warning";
        };
      };
      guard = E.or
        (E.eq (E.f "status") (E.lit "reserved"))
        (E.eq (E.f "status") (E.lit "confirmed"));
      set = { status = "cancelled"; };
    };

    use = {
      relationships = [];
      audit = {
        required = true;
        category = "workflow";
        reason = "Ticket admission must be traceable for venue operations.";
      };
      policy = {
        label = "Use ticket";
        description = "Staff check-in operation for admitting a confirmed ticket.";
        audiences = [ "staff" "service" ];
      };
      workflow = {
        group = "ticketLifecycle";
        transitions = [{
          field = config.refs.ticket.status;
          from = [ "confirmed" ];
          to = "used";
        }];
        audit.summary = "Marked ticket as used";
      };
      guard = E.and
        (E.eq (E.f "status") (E.lit "confirmed"))
        (E.eq (E.rel "performance" "status") (E.lit "scheduled"));
      set = { status = "used"; };
    };

    upgrade = {
      audit = {
        required = true;
        category = "payment";
        reason = "Ticket upgrades can affect customer entitlement and price.";
      };
      policy = {
        label = "Upgrade ticket";
        audiences = [ "customer" "service" ];
      };
      workflow = {
        group = "ticketLifecycle";
        transitions = [{
          field = config.refs.ticket.ticket_type;
          from = [ "standard" ];
          to = "vip";
        }];
        audit.summary = "Upgraded ticket";
      };
      guard = E.and
        (E.eq (E.f "ticket_type") (E.lit "standard"))
        (E.eq (E.f "status") (E.lit "confirmed"));
      set = { ticket_type = "vip"; };
    };
  };
}
