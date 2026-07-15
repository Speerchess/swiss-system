# Cloudflare Pages 배포 가이드 (Cloudflare Pages Deployment Guide)

이 체스 토너먼트 매니저 사이트는 클라이언트 사이드에서 모든 로직이 구동되는 정적 웹사이트(SPA)이므로, **Cloudflare Pages 무료 플랜**을 통해 완전 무료로 초고속 배포할 수 있습니다.

배포하는 방법은 크게 두 가지가 있습니다.

---

## 방법 1: GitHub 연동을 통한 자동 배포 (추천)

코드 변경 사항이 생길 때마다 자동으로 빌드 및 배포가 이루어지는 방식입니다.

1. **GitHub 저장소 생성 및 푸시**:
   - GitHub에 새 저장소(Repository)를 만듭니다.
   - 이 프로젝트 폴더를 저장소에 푸시합니다:
     ```bash
     git init
     git add .
     git commit -m "initial commit"
     git branch -M main
     git remote add origin <자신의_깃허브_저장소_주소>
     git push -u origin main
     ```

2. **Cloudflare 대시보드 로그인 및 프로젝트 생성**:
   - [Cloudflare Dashboard](https://dash.cloudflare.com/)에 로그인합니다.
   - 왼쪽 메뉴에서 **Workers & Pages** -> **Create** 버튼을 클릭합니다.
   - **Pages** 탭을 선택하고 **Connect to Git**을 클릭합니다.
   - 자신의 GitHub 계정을 연동한 후, 생성한 저장소를 선택합니다.

3. **빌드 설정 구성 (Build Settings)**:
   - **Framework preset**: `Vite`를 선택합니다.
   - **Build command**: `npm run build`
   - **Build output directory**: `dist`
   - **Root directory**: (비워둠 - 기본값)

4. **배포 시작**:
   - **Save and Deploy**를 클릭하면 빌드가 시작됩니다.
   - 빌드가 완료되면 Cloudflare에서 제공하는 기본 하위 도메인 (예: `chess-pairings.pages.dev`)으로 접속이 가능합니다.
   - 필요 시 **Custom Domains** 탭에서 개인 소유 도메인을 연결할 수 있습니다.

---

## 방법 2: Wrangler CLI를 통한 수동 직접 배포

저장소를 연동하지 않고 PC에서 직접 빌드한 결과물(`dist` 폴더)을 명령어로 업로드하여 배포하는 방식입니다.

1. **프로젝트 빌드**:
   - PC에서 빌드 명령어를 실행하여 `dist` 정적 폴더를 생성합니다:
     ```bash
     npm run build
     ```

2. **Wrangler로 배포 실행**:
   - npx를 사용하여 Cloudflare Pages에 직접 배포를 올립니다:
     ```bash
     npx wrangler pages deploy dist
     ```
   - 최초 실행 시 브라우저가 열리며 Cloudflare 로그인을 요구합니다.
   - 로그인 승인 후 프로젝트명을 설정하면 배포가 완료되며 즉시 고유 URL이 발급됩니다.
