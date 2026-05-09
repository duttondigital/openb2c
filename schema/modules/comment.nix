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

  relationships.comment.author.field = config.refs.comment.author_id;

  operations.comment =
    let rel = config.relationships.comment;
    in {
    read.relationships = with rel; [ author ];
    create.relationships = with rel; [ author ];
    update.relationships = with rel; [ author ];
    delete.relationships = with rel; [ author ];

    edit = {
      relationships = with rel; [ author ];
      guard = E.true_;  # Can always edit own comments (auth layer handles ownership)
      set = { };  # body set via parameters
    };
  };
}
