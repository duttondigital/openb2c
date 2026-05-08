{ config, lib, ... }:
let
  E = import ../lib/expr.nix;
  A = import ../lib/auth.nix;
in
{
  tables.issue = {
    id = { type = "integer"; pk = true; auto = true; };
    project_id = { type = "integer"; required = true; references = "project(id)"; };
    number = { type = "integer"; required = true; };  # Project-scoped issue number
    title = { type = "text"; required = true; };
    description = { type = "text"; };
    type = { type = "text"; default = "'task'"; };  # task, bug, feature, epic
    status = { type = "text"; default = "'todo'"; };  # todo, in_progress, in_review, done, cancelled
    priority = { type = "text"; default = "'medium'"; };  # low, medium, high, urgent
    creator_id = { type = "integer"; required = true; references = "user(id)"; };
    assignee_id = { type = "integer"; references = "user(id)"; };
    created_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
    updated_at = { type = "text"; default = "CURRENT_TIMESTAMP"; };
  };

  operations.issue = {
    start = {
      guard = E.and
        (E.and
          (E.eq (E.f "status") (E.lit "todo"))
          (E.notNull (E.f "assignee_id")))
        (E.eq (E.rel "project" "status") (E.lit "active"));
      set = { status = "in_progress"; };
      effects = [
        { notify = { channel = "email"; template = "issue_started"; }; }
      ];
    };

    submit_for_review = {
      guard = E.eq (E.f "status") (E.lit "in_progress");
      set = { status = "in_review"; };
      effects = [
        { notify = { channel = "email"; template = "issue_review_requested"; }; }
      ];
    };

    complete = {
      guard = E.or
        (E.eq (E.f "status") (E.lit "in_review"))
        (E.eq (E.f "status") (E.lit "in_progress"));
      set = { status = "done"; };
      effects = [
        { emit = "issue.completed"; }
      ];
    };

    cancel = {
      guard = E.and
        (E.ne (E.f "status") (E.lit "done"))
        (E.ne (E.f "status") (E.lit "cancelled"));
      set = { status = "cancelled"; };
    };

    reopen = {
      guard = E.or
        (E.eq (E.f "status") (E.lit "done"))
        (E.eq (E.f "status") (E.lit "cancelled"));
      set = { status = "todo"; };
    };

    assign = {
      guard = E.and
        (E.ne (E.f "status") (E.lit "done"))
        (E.ne (E.f "status") (E.lit "cancelled"));
      set = { };  # assignee_id set via parameters
      effects = [
        { notify = { channel = "email"; template = "issue_assigned"; }; }
      ];
    };

    escalate = {
      guard = E.and
        (E.ne (E.f "priority") (E.lit "urgent"))
        (E.ne (E.f "status") (E.lit "done"));
      set = { priority = "urgent"; };
      effects = [
        { notify = { channel = "email"; template = "issue_escalated"; }; }
      ];
    };
  };

  authorization.issue = {
    ownerFields = [ "creator_id" "assignee_id" ];
    read.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "issue.read" "read" ])
      (A.scopedAny [ "issue.read" "read" ])
    ];
    create.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "issue.create" "write" ])
      (A.scopedAny [ "issue.create" "write" ])
    ];
    update.allow = [
      A.operator
      A.ownerUser
      (A.ownerService [ "issue.update" "write" ])
      (A.scopedAny [ "issue.update" "write" ])
    ];
    delete.allow = [
      A.operator
      (A.scopedAny [ "issue.delete" ])
    ];
    operations = {
      start.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "issue.start" "write" ])
        (A.scopedAny [ "issue.start" ])
      ];
      submit_for_review.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "issue.submit_for_review" "write" ])
        (A.scopedAny [ "issue.submit_for_review" ])
      ];
      complete.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "issue.complete" "write" ])
        (A.scopedAny [ "issue.complete" ])
      ];
      cancel.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "issue.cancel" "write" ])
        (A.scopedAny [ "issue.cancel" ])
      ];
      reopen.allow = [
        A.operator
        A.ownerUser
        (A.ownerService [ "issue.reopen" "write" ])
        (A.scopedAny [ "issue.reopen" ])
      ];
      assign.allow = [
        A.operator
        (A.scopedAny [ "issue.assign" ])
      ];
      escalate.allow = [
        A.operator
        (A.scopedAny [ "issue.escalate" ])
      ];
    };
  };
}
