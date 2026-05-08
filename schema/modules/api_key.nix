{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in {
  tables.api_key = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = { type = "integer"; required = false; references = "user(id)"; };  # optional: scope to user
    key_hash = { type = "text"; required = true; };  # bcrypt hash, never expose
    key_prefix = { type = "text"; required = true; };  # first 8 chars for identification
    name = { type = "text"; required = true; };  # description e.g. "mobile app"
    scopes = { type = "text"; required = false; default = "'*'"; };  # comma-separated: "read,write" or "*"
    active = { type = "integer"; required = false; default = "1"; };
    created_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
    last_used_at = { type = "text"; required = false; };
    expires_at = { type = "text"; required = false; };
  };

  operations.api_key = {
    revoke = {
      guard = E.eq (E.f "active") (E.lit 1);
      set = { active = "0"; };
    };
  };

  authorization.api_key = {
    ownerFields = [ "user_id" ];
    read.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "api_key.read" "read" ])
      (A.scopedAny [ "api_key.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.ownerUser
      (A.scopedAny [ "api_key.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "api_key.update" "write" ])
      (A.scopedAny [ "api_key.update" "write" ])
    ];
    delete.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "api_key.delete" "write" ])
      (A.scopedAny [ "api_key.delete" "write" ])
    ];
    operations.revoke.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "api_key.revoke" "write" ])
      (A.scopedAny [ "api_key.revoke" ])
    ];
  };
}
