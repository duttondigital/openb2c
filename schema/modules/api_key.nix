{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in {
  tables.api_key = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = { type = "integer"; required = true; references = "user(id)"; };
    key_hash = { type = "text"; required = true; };  # bcrypt hash, never expose
    key_prefix = { type = "text"; required = true; };  # first 8 chars for identification
    name = { type = "text"; required = true; };  # description e.g. "mobile app"
    scopes = { type = "text"; required = false; default = "'*'"; };  # comma-separated: "read,write" or "*"
    active = { type = "integer"; required = false; default = "1"; };
    created_at = { type = "text"; required = false; default = "CURRENT_TIMESTAMP"; };
    last_used_at = { type = "text"; required = false; };
    expires_at = { type = "text"; required = false; };
  };

  relationships.api_key.owner.field = config.refs.api_key.user_id;

  operations.api_key =
    let rel = config.relationships.api_key;
    in {
      read.relationships = with rel; [ owner ];
      create.relationships = with rel; [ owner ];
      update.relationships = with rel; [ owner ];
      delete.relationships = with rel; [ owner ];
      revoke = {
        relationships = with rel; [ owner ];
        guard = E.eq (E.f "active") (E.lit 1);
        set = { active = "0"; };
      };
  };
}
