# Extends user for B2C/customer contexts
{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.user = {
    customer_type = { type = "text"; default = "'individual'"; };  # individual, patron, organization
  };

  operations.user = {
    upgrade_to_patron = {
      relationships = with config.relationships.user; [ self ];
      guard = E.and
        (E.ne (E.f "customer_type") (E.lit "patron"))
        (E.notNull (E.f "email"));
      set = { customer_type = "patron"; };
      effects = [
        { notify = { channel = "email"; template = "patron_welcome"; }; }
      ];
    };
  };
}
