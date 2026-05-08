{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
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

  authorization.venue = {
    read.allow = [
      A.public
      A.operator
      A.service
      (A.scopedAny [ "venue.read" "read" ])
    ];
    create.allow = [
      A.operator
      (A.scopedAny [ "venue.create" "write" ])
    ];
    update.allow = [
      A.operator
      (A.scopedAny [ "venue.update" "write" ])
    ];
    delete.allow = [
      A.admin
      (A.scopedAny [ "venue.delete" ])
    ];
    operations = {
      deactivate.allow = [
        A.operator
        (A.scopedAny [ "venue.deactivate" ])
      ];
      activate.allow = [
        A.operator
        (A.scopedAny [ "venue.activate" ])
      ];
    };
  };
}
