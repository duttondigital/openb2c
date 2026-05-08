{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.comment = {
    id = { type = "integer"; pk = true; auto = true; };
    issue_id = { type = "integer"; required = true; references = "issue(id)"; };
    author_id = { type = "integer"; required = true; references = "user(id)"; };
    body = { type = "text"; required = true; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
    updated_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.comment = {
    edit = {
      guard = E.true_;  # Can always edit own comments (auth layer handles ownership)
      set = { };  # body set via parameters
    };
  };

  authorization.comment = {
    ownerFields = [ "author_id" ];
    read.allow = [
      A.operator
      A.user
      A.service
      (A.scopedAny [ "comment.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "comment.create" "write" ])
      (A.scopedAny [ "comment.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "comment.update" "write" ])
      (A.scopedAny [ "comment.update" "write" ])
    ];
    delete.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "comment.delete" "write" ])
      (A.scopedAny [ "comment.delete" "write" ])
    ];
    operations.edit.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "comment.edit" "write" ])
      (A.scopedAny [ "comment.edit" ])
    ];
  };
}
