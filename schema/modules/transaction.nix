{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.transaction = {
    id = { type = "integer"; pk = true; auto = true; };
    customer_id = { type = "integer"; required = true; references = "customer(id)"; };
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
    transaction_id = { type = "integer"; required = true; references = "transaction(id)"; };
    ticket_id = { type = "integer"; required = true; references = "ticket(id)"; };
  };

  operations.transaction = {
    complete = {
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
      guard = E.eq (E.f "status") (E.lit "pending");
      set = { status = "failed"; };
      cascade = [{
        entity = "ticket";
        via = "transaction_ticket";
        set = { status = "cancelled"; };
      }];
    };

    refund = {
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
