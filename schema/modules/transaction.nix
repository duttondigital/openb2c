{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.transaction = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = { type = "integer"; required = true; references = "user(id)"; };
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

  authorization.transaction = {
    ownerFields = [ "user_id" ];
    read.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "transaction.read" "read" ])
      (A.scopedAny [ "transaction.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "transaction.create" "write" ])
      (A.scopedAny [ "transaction.create" "write" ])
    ];
    update.allow = [
      A.operator
      (A.scopedAny [ "transaction.update" "write" ])
    ];
    delete.allow = [
      A.admin
      (A.scopedAny [ "transaction.delete" ])
    ];
    operations = {
      complete.allow = [
        A.operator
        (A.scopedAny [ "transaction.complete" ])
      ];
      fail.allow = [
        A.operator
        (A.scopedAny [ "transaction.fail" ])
      ];
      refund.allow = [
        A.operator
        (A.scopedAny [ "transaction.refund" ])
      ];
    };
  };

  authorization.transaction_ticket = {
    read.allow = [
      A.operator
      (A.scopedAny [ "transaction_ticket.read" "read" ])
    ];
    create.allow = [
      A.operator
      (A.scopedAny [ "transaction_ticket.create" "write" ])
    ];
    update.allow = [
      A.operator
      (A.scopedAny [ "transaction_ticket.update" "write" ])
    ];
    delete.allow = [
      A.operator
      (A.scopedAny [ "transaction_ticket.delete" "write" ])
    ];
  };
}
