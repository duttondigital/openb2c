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
    owner_id = { type = "integer"; required = true; references = "user(id)"; };
    status = { type = "text"; default = "'active'"; };  # active, archived
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  relationships.project.owner.field = config.refs.project.owner_id;

  operations.project =
    let rel = config.relationships.project;
    in {
    read.relationships = with rel; [ owner ];
    create.relationships = with rel; [ owner ];
    update.relationships = with rel; [ owner ];

    archive = {
      relationships = with rel; [ owner ];
      guard = E.eq (E.f "status") (E.lit "active");
      set = { status = "archived"; };
    };

    unarchive = {
      relationships = with rel; [ owner ];
      guard = E.eq (E.f "status") (E.lit "archived");
      set = { status = "active"; };
    };
  };
}
