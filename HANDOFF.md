# 인수인계 — 후쿠마루(일본 X) 미션

새 세션에서 "HANDOFF.md 읽고 이어서 진행해줘"로 시작하면 됩니다.
**큰 변화가 생길 때마다 이 파일을 갱신할 것.** (최종 업데이트: 2026-07-24 14:45 KST)

## 미션 (변경 이력 있음)

- ~~원래: 7일 내 해외(영/일) 결제 1건~~ (`~/Downloads/rainbow-tarot-mission-prompt.md`)
- **현재: 1개월 내 일본 매출 ₩100,000+ (마감 2026-08-22). 광고비 없이 오가닉.**
- 중간 목표: X 팔로워 100명 → 그다음 매출 스프린트.

## 현재 상태 (2026-07-24 새벽 기준)

- **페르소나**: 후쿠마루(ふくまる), 검은 고양이 츤데레. 계정 `@fukumaru_tarot`.
  프로필 사진은 흰 고양이 → "로브를 입은 순간만 검은고양이 복을 빌려온다"는 설정으로 정합성 맞춤.
  가이드: `marketing/persona-guide.md`. 옛 `marketing/x-queue-ja.md`(즉시 판매용)는 보류 상태.
- **콘텐츠 큐**: `marketing/fukumaru-queue-ja.md` — 22개 중 **1~6번 게시 완료**(7/21~22, 전부 브라우저 수동 게시), 7번부터 대기.
- **성과**: 팔로워 0, 전 포스트 좋아요·댓글·리포스트 0, 조회수 1~6. (7/22 저녁 기준)
- **게시 방식 (7/24 결정): 브라우저 수동 게시로 확정.** X API는 무료 티어가 없고 선불 크레딧($5 최소)만 가능한데, 사용자가 "구매 발생 전 비용 부담스럽다"며 크레딧 충전 거절. API 파이프라인(`fukumaru-post.yml`)은 **비활성화**해둠(402로 매 슬롯 실패하며 알림 스팸만 만들어서). 크레딧 충전하게 되면 `gh workflow enable fukumaru-post.yml`로 재가동 — 코드는 그대로 살아 있음.
- **노트북 데드맨 스위치 (7/24 신규)**: 노트북이 죽으면 수동 게시 세션도 죽으므로 감시 장치 추가.
  - 노트북 launchd 에이전트(`~/Library/LaunchAgents/com.rainbow-tarot.fukumaru-heartbeat.plist`)가 10분마다 `scripts/fukumaru/heartbeat.sh` 실행 → GitHub 저장소 변수 `FUKUMARU_HEARTBEAT`에 타임스탬프.
  - GitHub Actions `.github/workflows/fukumaru-watchdog.yml`(30분마다)가 하트비트 35분 이상 끊기면 **Slack 알림**, 복구 시 복구 알림. 중복 방지는 `FUKUMARU_WATCHDOG_STATE` 변수.
  - **활성화 조건 2개 남음**: ① 워크플로가 main에 push돼야 스케줄 가동, ② `SLACK_WEBHOOK_URL` 시크릿을 사용자가 직접 등록해야 함(웹훅 URL은 자격증명이라 어시스턴트가 취급 안 함).

## 🚨 지금 막힌 것

1. ~~X API 402~~ → **수동 게시로 우회하기로 결정(7/24).** 상세는 위 "게시 방식" 참고.
2. Gemini 이미지 생성 429 할당량 초과(무료 티어 한도 0, 네오라 봇과 키 공유 탓) — 수동 게시 체제에서는 어차피 안 씀. 보류.

## 바로 다음 할 일

1. **워치독 활성화 마무리**: 사용자가 Slack Incoming Webhook 만들고 본인 터미널에서 `gh secret set SLACK_WEBHOOK_URL --repo onione2173/rainbow-tarot` 실행 + 워치독 커밋을 main에 push.
2. 매일 게시 슬롯에 맞춰 큐의 다음 `[ ]` 항목(현재 7번부터)을 **브라우저로 수동 게시** + 큐에 `[x]`·시각 기록. (`fukumaru-schedule.json`은 파이프라인 정지 중이라 더 이상 안 갱신됨 — 무시.)
3. 게시 후 반응 체크, 라이브 검색(`#猫のいる暮らし` 등)으로 방금 올라온 글에 자연스러운 소통(팔로우 목록 뒤지지 말 것 — 죽은 계정 많음).
4. 일지 작성: `log/team-lead-journal.md` — **7/23 항목이 비어 있음**, 7/23 파이프라인 전멸 사실 기록할 것.

## 대기 중 (막힌 것 아님, 미션 외)

- 해외 결제 수단 확장: Lemon Squeezy 답변 대기(Paddle은 점술 카테고리 거절). 현재 PayPal(¥400)은 살아 있음.
- 한국어 나이스페이 실결제 셀프 테스트(₩1,500) — 우선순위 낮음.
- Supabase RLS 때문에 anon 세션에서 `reading_history` 조회 불가 → 결제 0건이 진짜 0건인지 서버 함수 경유로 확인 필요.

## 운영 규칙 (요약 — 상세는 메모리)

- **git push는 사용자 요청 시에만.** 로컬 커밋까지만 하고 push는 사용자에게 맡길 것.
- Netlify 배포 크레딧 아끼기 — 변경사항 모아서 한 번에.
- 일본어 텍스트는 항상 한국어 번역 병기 (사용자가 일본어 못 읽음).
- 유니코드 이모지 최소화, 가오모지 사용. 답글은 짧고 평범하게(따옴표 스타일 금지).
- 일지는 윤자동식 "~다" 건조체.
- 톤/카피 같은 주관적 결정은 객관식으로 좁히기 전에 사용자가 자유롭게 말할 여지부터 줄 것.

## 파일 위치

- 콘텐츠 큐: `marketing/fukumaru-queue-ja.md`
- 페르소나 가이드: `marketing/persona-guide.md`
- 파이프라인: `.github/workflows/fukumaru-post.yml`, `scripts/fukumaru/`, `marketing/state/fukumaru-schedule.json`
- 일지: `log/team-lead-journal.md` (팀장 일지), `log/YYYY-MM-DD.md` (일별)
- 이 파일: 저장소 루트 `HANDOFF.md`

## 매일 보고 형식

`방문자 수 / 유입 채널 / 결제 시도 / 결제 완료 / 오늘 한 일 / 내일 할 일 / 필요한 결정`
