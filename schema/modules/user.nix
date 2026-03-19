{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.user = {
    id = { type = "integer"; pk = true; auto = true; };
    email = { type = "text"; required = true; unique = true; };
    name = { type = "text"; required = true; };
    avatar_url = { type = "text"; };
    role = { type = "text"; default = "'member'"; };  # admin, member, viewer
    status = { type = "text"; default = "'active'"; };  # active, inactive, suspended
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.user = {
    suspend = {
      guard = E.eq (E.f "status") (E.lit "active");
      set = { status = "suspended"; };
      effects = [
        { notify = { channel = "email"; template = "account_suspended"; }; }
      ];
    };

    reactivate = {
      guard = E.or
        (E.eq (E.f "status") (E.lit "suspended"))
        (E.eq (E.f "status") (E.lit "inactive"));
      set = { status = "active"; };
    };

    promote_to_admin = {
      guard = E.and
        (E.eq (E.f "role") (E.lit "member"))
        (E.eq (E.f "status") (E.lit "active"));
      set = { role = "admin"; };
    };
  };
}
