{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
in
{
  tables.label = {
    id = { type = "integer"; pk = true; auto = true; };
    project_id = {
      type = "integer";
      required = true;
      references = "project(id)";
      relationship = {
        label = "Project";
        targetLabel = config.refs.project.name;
      };
    };
    name = { type = "text"; required = true; };
    color = { type = "text"; default = "'#808080'"; };  # Hex color
    description = { type = "text"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  # Junction table for many-to-many relationship
  tables.issue_label = {
    id = { type = "integer"; pk = true; auto = true; };
    issue_id = {
      type = "integer";
      required = true;
      references = "issue(id)";
      relationship = {
        label = "Issue";
        targetLabel = config.refs.issue.title;
      };
    };
    label_id = {
      type = "integer";
      required = true;
      references = "label(id)";
      relationship = {
        label = "Label";
        targetLabel = config.refs.label.name;
      };
    };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  indexes.issue_label.unique_pair = {
    columns = [ "issue_id" "label_id" ];
    unique = true;
  };

  operations.label = { };
}
