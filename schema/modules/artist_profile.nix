{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.artist_profile = {
    id = { type = "integer"; pk = true; auto = true; };
    user_id = {
      type = "integer";
      required = true;
      unique = true;
      references = "user(id)";
      metadata = {
        label = "User";
        displayPriority = 10;
      };
      relationship = {
        label = "User";
        description = "Canonical person this artist profile enriches.";
        targetLabel = config.refs.user.name;
      };
    };
    role = {
      type = "text";
      required = true;
      metadata = {
        label = "Artist role";
        placeholder = "Soprano";
        displayPriority = 20;
      };
    };
    bio = {
      type = "text";
      metadata = {
        label = "Bio";
        format = "textarea";
        displayPriority = 30;
      };
    };
    active = {
      type = "integer";
      default = "1";
      metadata = {
        label = "Active";
        displayPriority = 40;
      };
    };
    created_at = {
      type = "text";
      default = "CURRENT_TIMESTAMP";
      metadata = {
        label = "Created";
        format = "date-time";
        displayPriority = 1000;
      };
    };
  };

  operations.artist_profile = {
    read.public = true;

    deactivate = {
      guard = E.eq (E.f "active") (E.lit 1);
      set = { active = "0"; };
    };

    activate = {
      guard = E.eq (E.f "active") (E.lit 0);
      set = { active = "1"; };
    };
  };
}
