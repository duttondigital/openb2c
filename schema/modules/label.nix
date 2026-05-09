{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.label = {
    id = { type = "integer"; pk = true; auto = true; };
    project_id = { type = "integer"; required = true; references = "project(id)"; };
    name = { type = "text"; required = true; };
    color = { type = "text"; default = "'#808080'"; };  # Hex color
    description = { type = "text"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  # Junction table for many-to-many relationship
  tables.issue_label = {
    id = { type = "integer"; pk = true; auto = true; };
    issue_id = { type = "integer"; required = true; references = "issue(id)"; };
    label_id = { type = "integer"; required = true; references = "label(id)"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  indexes.issue_label.unique_pair = {
    columns = [ "issue_id" "label_id" ];
    unique = true;
  };

  operations.label = { };
}
