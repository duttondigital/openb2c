{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.project = {
    id = { type = "integer"; pk = true; auto = true; };
    key = { type = "text"; required = true; unique = true; };  # e.g., "PROJ", "ENG"
    name = { type = "text"; required = true; };
    description = { type = "text"; };
    owner_id = {
      type = "integer";
      required = true;
      references = "user(id)";
      relationship = {
        label = "Owner";
        description = "User accountable for this project.";
      };
    };
    status = { type = "text"; default = "'active'"; };  # active, archived
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.project = {
    read.relationships = [ "owner" ];
    create.relationships = [ "owner" ];
    update.relationships = [ "owner" ];

    archive = {
      guard = E.eq (E.f "status") (E.lit "active");
      set = { status = "archived"; };
    };

    unarchive = {
      guard = E.eq (E.f "status") (E.lit "archived");
      set = { status = "active"; };
    };
  };
}
