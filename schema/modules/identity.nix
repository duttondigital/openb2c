{ config, lib, ... }:
let
  A = import ../lib/auth.nix;
in
{
  # Identity registry for federated auth
  # Verifies email ownership, issues signed certificates

  tables.identity_challenge = {
    id = { type = "integer"; pk = true; auto = true; };
    email = { type = "text"; required = true; };
    code = { type = "text"; required = true; };
    public_key = { type = "text"; required = true; };
    created_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
    expires_at = { type = "text"; required = true; };
    used = { type = "integer"; required = false; default = "0"; };
  };

  tables.identity_registry = {
    id = { type = "integer"; pk = true; auto = true; };
    email = { type = "text"; required = true; unique = true; };
    public_key = { type = "text"; required = true; };
    verified_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
    revoked = { type = "integer"; required = false; default = "0"; };
  };

  authorization.identity_challenge = {
    read.allow = [ A.admin (A.scopedAny [ "identity_challenge.read" ]) ];
    create.allow = [ A.admin (A.scopedAny [ "identity_challenge.create" ]) ];
    update.allow = [ A.admin (A.scopedAny [ "identity_challenge.update" ]) ];
    delete.allow = [ A.admin (A.scopedAny [ "identity_challenge.delete" ]) ];
  };

  authorization.identity_registry = {
    read.allow = [ A.admin (A.scopedAny [ "identity_registry.read" ]) ];
    create.allow = [ A.admin (A.scopedAny [ "identity_registry.create" ]) ];
    update.allow = [ A.admin (A.scopedAny [ "identity_registry.update" ]) ];
    delete.allow = [ A.admin (A.scopedAny [ "identity_registry.delete" ]) ];
  };
}
