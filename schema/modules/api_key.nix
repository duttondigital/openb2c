{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in {
  tables.api_key = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = {
      type = "integer";
      required = true;
      references = "user(id)";
      metadata = {
        label = "User";
        displayPriority = 10;
      };
    };
    key_hash = {
      type = "text";
      required = true;
      metadata = {
        label = "Key hash";
        privacy = "secret";
        redact = true;
      };
    };
    key_prefix = {
      type = "text";
      required = true;
      metadata = {
        label = "Key prefix";
        displayPriority = 20;
      };
    };
    name = {
      type = "text";
      required = true;
      metadata = {
        label = "Name";
        placeholder = "Mobile app";
        displayPriority = 30;
      };
      validation.maxLength = 120;
    };
    scopes = {
      type = "text";
      required = false;
      default = "'*'";
      metadata = {
        label = "Scopes";
        helpText = "Comma-separated permission scopes, or * for all scopes.";
        displayPriority = 40;
      };
    };
    active = {
      type = "integer";
      required = false;
      default = "1";
      metadata = {
        label = "Active";
        displayPriority = 50;
      };
      validation.enum = [ "0" "1" ];
    };
    created_at = {
      type = "text";
      required = false;
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
    last_used_at = {
      type = "text";
      required = false;
      metadata = {
        label = "Last used";
        format = "date-time";
        displayPriority = 1010;
      };
    };
    expires_at = {
      type = "text";
      required = false;
      metadata = {
        label = "Expires";
        placeholder = "YYYY-MM-DD";
        format = "date";
        displayPriority = 60;
      };
    };
  };

  operations.api_key = {
    revoke = {
      guard = E.eq (E.f "active") (E.lit 1);
      set = { active = "0"; };
    };
  };
}
