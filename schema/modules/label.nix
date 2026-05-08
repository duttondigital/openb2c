{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
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

  operations.label = { };

  authorization.label = {
    read.allow = [
      A.operator
      A.service
      (A.scopedAny [ "label.read" "read" ])
    ];
    create.allow = [
      A.operator
      (A.scopedAny [ "label.create" "write" ])
    ];
    update.allow = [
      A.operator
      (A.scopedAny [ "label.update" "write" ])
    ];
    delete.allow = [
      A.operator
      (A.scopedAny [ "label.delete" "write" ])
    ];
  };

  authorization.issue_label = {
    read.allow = [
      A.operator
      A.service
      (A.scopedAny [ "issue_label.read" "read" ])
    ];
    create.allow = [
      A.operator
      (A.scopedAny [ "issue_label.create" "write" ])
    ];
    update.allow = [
      A.operator
      (A.scopedAny [ "issue_label.update" "write" ])
    ];
    delete.allow = [
      A.operator
      (A.scopedAny [ "issue_label.delete" "write" ])
    ];
  };
}
