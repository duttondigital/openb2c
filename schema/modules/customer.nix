{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.customer = {
    id = { type = "integer"; pk = true; auto = true; };
    name = { type = "text"; required = true; };
    email = { type = "text"; unique = true; };
    phone = { type = "text"; };
    customer_type = { type = "text"; default = "'individual'"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  # CRUD operations are implicit (generated for all entities)
  # Only define custom operations here
  operations.customer = {
    upgrade_to_patron = {
      guard = E.and
        (E.ne (E.f "customer_type") (E.lit "patron"))
        (E.notNull (E.f "email"));
      set = {
        customer_type = "patron";
      };
      effects = [
        { notify = { channel = "email"; template = "patron_welcome"; }; }
      ];
    };
  };

  authorization.customer = {
    read.allow = [
      A.operator
      A.service
      (A.scopedAny [ "customer.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.service
      (A.scopedAny [ "customer.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.service
      (A.scopedAny [ "customer.update" "write" ])
    ];
    delete.allow = [
      A.admin
      (A.scopedAny [ "customer.delete" ])
    ];
    operations.upgrade_to_patron.allow = [
      A.operator
      A.service
      (A.scopedAny [ "customer.upgrade_to_patron" ])
    ];
  };
}
