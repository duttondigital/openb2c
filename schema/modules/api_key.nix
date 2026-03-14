{ config, lib, ... }:
let E = import ../lib/expr.nix;
in {
  tables.api_key = {
    id = { type = "integer"; pk = true; auto = true; };
    key = { type = "text"; required = true; unique = true; };
    name = { type = "text"; required = true; };  # description e.g. "mobile app"
    customer_id = { type = "integer"; required = false; references = "customer(id)"; };  # optional: scope to customer
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
      effects = [{ emit = "api_key.revoked"; }];
    };
  };
}
