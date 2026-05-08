{ config, lib, ... }:
let
  A = import ../lib/auth.nix;
in
{
  # Base user entity - extend with domain-specific fields in other modules
  tables.user = {
    id = { type = "integer"; pk = true; auto = true; };
    email = { type = "text"; required = true; unique = true; };
    name = { type = "text"; required = true; };
    phone = { type = "text"; };
    avatar_url = { type = "text"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  authorization.user = {
    ownerFields = [ "id" ];
    read.allow = [
      A.operator
      A.service
      A.ownerUser
      (A.scopedAny [ "user.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.service
      (A.scopedAny [ "user.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "user.update" "write" ])
      (A.scopedAny [ "user.update" "write" ])
    ];
    delete.allow = [
      A.admin
      (A.scopedAny [ "user.delete" ])
    ];
  };
}
