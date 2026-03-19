{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.venue = {
    id = { type = "integer"; pk = true; auto = true; };
    name = { type = "text"; required = true; };
    address = { type = "text"; required = true; };
    city = { type = "text"; required = true; };
    postcode = { type = "text"; required = true; };
    capacity = { type = "integer"; required = true; };
    active = { type = "integer"; default = "1"; };  # SQLite boolean
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.venue = {
    deactivate = {
      guard = E.eq (E.f "active") (E.lit 1);
      set = { active = "0"; };
    };

    activate = {
      guard = E.eq (E.f "active") (E.lit 0);
      set = { active = "1"; };
    };
  };
}
