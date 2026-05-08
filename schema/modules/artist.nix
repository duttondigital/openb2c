{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
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
    deactivate = {
      guard = E.eq (E.f "active") (E.lit 1);
      set = { active = "0"; };
    };

    activate = {
      guard = E.eq (E.f "active") (E.lit 0);
      set = { active = "1"; };
    };
  };

  authorization.artist = {
    read.allow = [
      A.public
      A.operator
      A.service
      (A.scopedAny [ "artist.read" "read" ])
    ];
    create.allow = [
      A.operator
      (A.scopedAny [ "artist.create" "write" ])
    ];
    update.allow = [
      A.operator
      (A.scopedAny [ "artist.update" "write" ])
    ];
    delete.allow = [
      A.admin
      (A.scopedAny [ "artist.delete" ])
    ];
    operations = {
      deactivate.allow = [
        A.operator
        (A.scopedAny [ "artist.deactivate" ])
      ];
      activate.allow = [
        A.operator
        (A.scopedAny [ "artist.activate" ])
      ];
    };
  };
}
