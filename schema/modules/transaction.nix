{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.transaction = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = {
      type = "integer";
      required = true;
      references = "user(id)";
      relationship = {
        label = "Customer";
        description = "Customer who owns this transaction.";
        targetLabel = config.refs.user.email;
      };
    };
    amount_pence = { type = "integer"; required = true; };
    type = { type = "text"; required = true; };  # purchase, refund, donation
    status = { type = "text"; default = "'pending'"; };  # pending, completed, failed, refunded
    reference = { type = "text"; };  # External payment reference
    client = { type = "text"; default = "'web'"; };  # web, mcp, api
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  # Link tickets to transactions
  tables.transaction_ticket = {
    id = { type = "integer"; pk = true; auto = true; };
    transaction_id = {
      type = "integer";
      required = true;
      references = "transaction(id)";
      relationship = {
        label = "Transaction";
        targetLabel = config.refs.transaction.reference;
      };
    };
    ticket_id = {
      type = "integer";
      required = true;
      references = "ticket(id)";
      relationship = {
        label = "Ticket";
        targetLabel = config.refs.ticket.seat;
      };
    };
  };

  indexes.transaction_ticket.unique_pair = {
    columns = [ "transaction_id" "ticket_id" ];
    unique = true;
  };

  workflows.groups.paymentLifecycle = {
    label = "Payment lifecycle";
    description = "Payment settlement and refund operations.";
    displayPriority = 30;
  };

  audit.entities.transaction = {
    operations = [ "create" "update" "delete" "complete" "fail" "refund" ];
    category = "payment";
    reason = "Transactions represent payment and refund state.";
  };

  operations.transaction = {
    complete = {
      relationships = [];
      audit = {
        required = true;
        category = "payment";
        reason = "Payment settlement must be auditable.";
      };
      policy = {
        label = "Complete transaction";
        description = "Payment settlement operation usually performed by a payment service or staff operator.";
        audiences = [ "staff" "service" ];
        risk = "high";
      };
      workflow = {
        group = "paymentLifecycle";
        transitions = [{
          field = config.refs.transaction.status;
          from = [ "pending" ];
          to = "completed";
        }];
        audit.summary = "Completed transaction";
      };
      guard = E.eq (E.f "status") (E.lit "pending");
      set = { status = "completed"; };
      cascade = [{
        entity = "ticket";
        via = "transaction_ticket";
        set = { status = "confirmed"; };
      }];
      effects = [
        { notify = { channel = "email"; template = "receipt"; }; }
        { call = { service = "analytics"; action = "track_purchase"; }; }
      ];
    };

    fail = {
      relationships = [];
      audit = {
        required = true;
        category = "payment";
        reason = "Payment failure affects order and ticket state.";
      };
      policy = {
        label = "Fail transaction";
        audiences = [ "staff" "service" ];
        risk = "high";
      };
      workflow = {
        group = "paymentLifecycle";
        transitions = [{
          field = config.refs.transaction.status;
          from = [ "pending" ];
          to = "failed";
        }];
        audit.summary = "Failed transaction";
      };
      guard = E.eq (E.f "status") (E.lit "pending");
      set = { status = "failed"; };
      cascade = [{
        entity = "ticket";
        via = "transaction_ticket";
        set = { status = "cancelled"; };
      }];
    };

    refund = {
      relationships = [];
      audit = {
        required = true;
        category = "payment";
        reason = "Refunds must be traceable for finance and support.";
      };
      policy = {
        label = "Refund transaction";
        audiences = [ "staff" "service" ];
        risk = "high";
      };
      workflow = {
        group = "paymentLifecycle";
        transitions = [{
          field = config.refs.transaction.status;
          from = [ "completed" ];
          to = "refunded";
        }];
        audit.summary = "Refunded transaction";
        confirmation = {
          required = true;
          title = "Refund transaction";
          message = "This will start a payment refund and cancel linked tickets.";
          confirmLabel = "Refund";
          severity = "danger";
        };
      };
      guard = E.eq (E.f "status") (E.lit "completed");
      set = { status = "refunded"; };
      cascade = [{
        entity = "ticket";
        via = "transaction_ticket";
        set = { status = "cancelled"; };
      }];
      effects = [
        { notify = { channel = "email"; template = "refund_confirmation"; }; }
        { call = { service = "payment"; action = "process_refund"; }; }
      ];
    };
  };
}
