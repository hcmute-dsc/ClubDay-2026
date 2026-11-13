import { QUIZ_IMPORT_SAMPLE } from '@clubday/contract';

/** File mẫu cho BTC tải về. Nội dung nằm ở `@clubday/contract` (server kiểm nó bằng test). */
export const QUIZ_SAMPLE_JSON = JSON.stringify(QUIZ_IMPORT_SAMPLE, null, 2);
