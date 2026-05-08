# Extends user for B2C/customer contexts
{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.user = {
    customer_type = { type = "text"; default = "'individual'"; };  # individual, patron, organization
  };

  operations.user = {
    upgrade_to_patron = {
      guard = E.and
        (E.ne (E.f "customer_type") (E.lit "patron"))
        (E.notNull (E.f "email"));
      set = { customer_type = "patron"; };
      effects = [
        { notify = { channel = "email"; template = "patron_welcome"; }; }
      ];
    };
  };

  authorization.user.operations.upgrade_to_patron.allow = [
    A.operator
    A.ownerUser
    (A.ownerService [ "user.upgrade_to_patron" "write" ])
    (A.scopedAny [ "user.upgrade_to_patron" ])
  ];
}
