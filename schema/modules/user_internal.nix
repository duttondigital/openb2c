# Extends user for internal team contexts
{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.user = {
    role = { type = "text"; default = "'member'"; };  # admin, member, viewer
    status = { type = "text"; default = "'active'"; };  # active, inactive, suspended
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

  authorization.user.operations = {
    suspend.allow = [
      A.admin
      (A.scopedAny [ "user.suspend" ])
    ];
    reactivate.allow = [
      A.admin
      (A.scopedAny [ "user.reactivate" ])
    ];
    promote_to_admin.allow = [
      A.admin
      (A.scopedAny [ "user.promote_to_admin" ])
    ];
  };
}
