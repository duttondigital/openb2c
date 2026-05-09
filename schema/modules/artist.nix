{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.artist = {
    id = { type = "integer"; pk = true; auto = true; };
    name = { type = "text"; required = true; };
    role = { type = "text"; required = true; };  # soprano, tenor, conductor, etc.
    bio = { type = "text"; };
    email = { type = "text"; };
    active = { type = "integer"; default = "1"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.artist = {
    read.public = true;

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
