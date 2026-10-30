import type {
  AnswerKey,
  CheckResolution,
  GradeResult,
  Kid,
  Parent,
  Sheet,
  Submission,
} from "./store";

// The wire shape of GET /api/account: the signed-in parent's server
// state expressed in the client's own record types, so the device can
// seed it into its live database unchanged. Photos travel separately —
// this payload carries only references; the bytes are fetched per photo
// from /api/account/photos/:blobId.
export interface AccountPhotoRef {
  key: string;
  blobId: string;
}

export interface AccountState {
  parent: Parent;
  kids: Kid[];
  sheets: Sheet[];
  answerKeys: AnswerKey[];
  submissions: Submission[];
  gradeResults: GradeResult[];
  checkResolutions: CheckResolution[];
  photos: AccountPhotoRef[];
}
