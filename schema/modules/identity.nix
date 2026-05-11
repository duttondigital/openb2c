{ config, lib, ... }:
{
  # Identity registry for federated auth
  # Verifies email ownership, issues signed certificates

  tables.identity_challenge = {
    id = { type = "integer"; pk = true; auto = true; };
    email = { type = "text"; required = true; };
    code_hash = { type = "text"; required = true; };
    public_key = { type = "text"; required = true; };
    ip_address = { type = "text"; required = false; };
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

  tables.identity_verification_attempt = {
    id = { type = "integer"; pk = true; auto = true; };
    challenge_id = { type = "integer"; required = true; };
    email = { type = "text"; required = true; };
    created_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
  };

  tables.identity_request_signature = {
    id = { type = "integer"; pk = true; auto = true; };
    signature = { type = "text"; required = true; unique = true; };
    created_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
  };

  tables.identity_session = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = { type = "integer"; required = true; references = "user(id)"; };
    token_hash = { type = "text"; required = true; };
    token_prefix = { type = "text"; required = true; };
    created_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
    last_used_at = { type = "text"; required = false; };
    expires_at = { type = "text"; required = true; };
    revoked = { type = "integer"; required = false; default = "0"; };
  };
}
