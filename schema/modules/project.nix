{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.project = {
    id = { type = "integer"; pk = true; auto = true; };
    key = { type = "text"; required = true; unique = true; };  # e.g., "PROJ", "ENG"
    name = { type = "text"; required = true; };
    description = { type = "text"; };
    owner_id = { type = "integer"; required = true; references = "user(id)"; };
    status = { type = "text"; default = "'active'"; };  # active, archived
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.project = {
    archive = {
      guard = E.eq (E.f "status") (E.lit "active");
      set = { status = "archived"; };
    };

    unarchive = {
      guard = E.eq (E.f "status") (E.lit "archived");
      set = { status = "active"; };
    };
  };

  authorization.project = {
    ownerFields = [ "owner_id" ];
    read.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "project.read" "read" ])
      (A.scopedAny [ "project.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "project.create" "write" ])
      (A.scopedAny [ "project.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "project.update" "write" ])
      (A.scopedAny [ "project.update" "write" ])
    ];
    delete.allow = [
      A.admin
      (A.scopedAny [ "project.delete" ])
    ];
    operations = {
      archive.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "project.archive" "write" ])
        (A.scopedAny [ "project.archive" ])
      ];
      unarchive.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "project.unarchive" "write" ])
        (A.scopedAny [ "project.unarchive" ])
      ];
    };
  };
}
