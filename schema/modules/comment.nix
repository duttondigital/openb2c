{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
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
    read.relationships = [ "author" ];
    create.relationships = [ "author" ];
    update.relationships = [ "author" ];
    delete.relationships = [ "author" ];

    edit = {
      guard = E.true_;  # Can always edit own comments (auth layer handles ownership)
      set = { };  # body set via parameters
    };
  };
}
