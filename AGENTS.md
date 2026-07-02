<!-- BEGIN:nextjs-agent-rules -->
# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` before writing any code. Heed deprecation notices.
<!-- END:nextjs-agent-rules -->

## Repository workflow

코드를 변경할 때는 반드시 다음 순서를 지킨다.

1. 코드 수정
2. `npm run lint`
3. `npm test` 및 변경 범위에 따라 `npm run build` 또는 `npm run test:browser`
4. `npm run format`
5. 기능, 코드, 파일 책임별로 변경을 나누어 Git 커밋

브라우저 동작, 접근 제어, 라우팅, 반응형 UI가 달라지면 브라우저 테스트를
실행한다. 서로 독립적인 변경을 한 커밋에 몰아넣지 않는다. 상세한 코딩 규칙은
`docs/CODING_STYLE.md`를 따른다.

Push 작업까지 포함된 경우 push 후 GitHub Actions 실행 결과를 반드시 확인한다.
실패한 workflow가 있으면 로그를 확인하고, 현재 변경과 관련된 오류는 숨기거나
우회하지 말고 수정한 뒤 로컬 검증과 GitHub Actions 확인을 다시 진행한다. 관련
오류가 남아 있는 상태에서는 작업을 완료한 것으로 보고하지 않는다.
