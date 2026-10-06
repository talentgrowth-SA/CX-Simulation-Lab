window.CX_CLOUD_CONFIG = {
  supabaseUrl: "https://cdvumwodsyygiqqdmuij.supabase.co",
  publishableKey: "sb_publishable_QxRYODcf28-lriKu_FIpfw_5ZP4G3Q6",
  requireCloud: true,
  programCode: "CX-EXCELLENCE-2026",
  adminRefreshSeconds: 15
};

/*
  CX Simulation Lab — V12.2 Cloud Persistence Hotfix
  Ensures every learner interaction is persisted centrally
  and restores the existing central record after re-login.
*/
(function installCXCloudHotfix() {
  let attempts = 0;

  const clone = (value) => {
    try {
      return JSON.parse(JSON.stringify(value));
    } catch (_) {
      return value;
    }
  };

  async function install() {
    attempts++;

    let storeReady = false;

    try {
      storeReady =
        typeof Store !== "undefined" &&
        Store &&
        typeof Store.patch === "function";
    } catch (_) {}

    const cloudReady =
      window.CXCloud &&
      typeof window.CXCloud.onLocalSave === "function" &&
      typeof window.CXCloud.flush === "function";

    if (!storeReady || !cloudReady) {
      if (attempts < 200) {
        setTimeout(install, 50);
      }
      return;
    }

    if (Store.__CX_V122_HOTFIX__) return;

    const originalPatch = Store.patch.bind(Store);
    const originalReset =
      typeof Store.reset === "function"
        ? Store.reset.bind(Store)
        : null;

    async function syncNow() {
      try {
        const snapshot = clone(Store.data);

        window.CXCloud.onLocalSave(snapshot);

        await window.CXCloud.flush(true);
      } catch (error) {
        console.warn("CX central sync deferred", error);
      }
    }

    Store.patch = async function (fn) {
      const result = await originalPatch(fn);

      await syncNow();

      return result;
    };

    if (originalReset) {
      Store.reset = async function () {
        const result = await originalReset();

        await syncNow();

        return result;
      };
    }

    /*
      Older V12 builds may not contain Store.replace().
      It is required when restoring a learner's central record
      after a new browser/private session.
    */
    if (typeof Store.replace !== "function") {
      Store.replace = async function (next, options = {}) {
        await Store.load();

        const current = Store.data;

        Object.keys(current).forEach((key) => {
          delete current[key];
        });

        Object.assign(current, clone(next || {}));

        if (typeof Store.save === "function") {
          await Store.save();
        }

        if (options.persist !== false) {
          await syncNow();
        }

        return current;
      };
    }

    /*
      After a valid learner code is claimed from a new browser,
      restore the learner's existing central record BEFORE continuing.
    */
    if (
      typeof window.CXCloud.claimIdentity === "function" &&
      typeof window.CXCloud.restoreMyRecord === "function" &&
      !window.CXCloud.__claimRestorePatched
    ) {
      const originalClaim =
        window.CXCloud.claimIdentity.bind(window.CXCloud);

      window.CXCloud.claimIdentity = async function (
        fullName,
        accessCode
      ) {
        const result = await originalClaim(fullName, accessCode);

        try {
          await window.CXCloud.restoreMyRecord();
        } catch (error) {
          console.warn("CX central restore deferred", error);
        }

        return result;
      };

      window.CXCloud.__claimRestorePatched = true;
    }

    Store.__CX_V122_HOTFIX__ = true;

    console.log("CX Simulation Lab V12.2 cloud persistence active");
  }

  setTimeout(install, 0);
})();
/* ============================================================
   V12.3 — Cross-Browser / Incognito Resume Fix
   Restores the CENTRAL learner record after code verification.
   ============================================================ */
(function installCXV123Resume() {
  let tries = 0;

  const clone = (v) => {
    try {
      return JSON.parse(JSON.stringify(v));
    } catch (_) {
      return v;
    }
  };

  async function install() {
    tries++;

    let ready = false;

    try {
      ready =
        typeof Store !== "undefined" &&
        Store &&
        window.CXCloud &&
        Store.__CX_V122_HOTFIX__;
    } catch (_) {}

    if (!ready) {
      if (tries < 240) setTimeout(install, 50);
      return;
    }

    if (window.CXCloud.__V123ResumePatched) return;

    async function restoreCentralRecord(options = {}) {
      try {
        const c = window.CXCloud.client();
        if (!c) return null;

        const {
          data: { session }
        } = await c.auth.getSession();

        if (!session) return null;

        const { data: profile, error: profileError } = await c
          .from("learner_profiles")
          .select("id,full_name,code_hint")
          .eq("auth_user_id", session.user.id)
          .maybeSingle();

        if (profileError || !profile?.id) return null;

        const { data: stateRow, error: stateError } = await c
          .from("learner_state")
          .select("state,updated_at")
          .eq("participant_id", profile.id)
          .maybeSingle();

        if (stateError || !stateRow?.state) return null;

        const remote = clone(stateRow.state);

        remote.cloud = remote.cloud || {};
        remote.cloud.participantId = profile.id;
        remote.cloud.accessCodeHint = profile.code_hint;
        remote.cloud.linkedAt =
          remote.cloud.linkedAt || Date.now();

        const local = Store.data || {};

        const sameParticipant =
          local.cloud?.participantId === profile.id;

        const localMeaningful = !!(
          local.knowledgePre?.completedAt ||
          local.knowledgePost?.completedAt ||
          (Array.isArray(local.attempts) &&
            local.attempts.length > 0) ||
          local.training?.started ||
          local.actionPlan ||
          local.participantLocked
        );

        const remoteUpdated =
          new Date(stateRow.updated_at || 0).getTime();

        const localUpdated =
          Number(local.updated || 0);

        const shouldRestore =
          options.force === true ||
          !sameParticipant ||
          !localMeaningful ||
          remoteUpdated >= localUpdated;

        if (shouldRestore) {
          await Store.replace(remote, {
            persist: false
          });

          try {
            if (typeof App !== "undefined") {
              App.channel =
                Store.data.channel ||
                App.channel ||
                null;

              App.lang =
                Store.data.lang ||
                App.lang ||
                "ar";

              document.documentElement.lang =
                App.lang;

              document.documentElement.dir =
                App.lang === "ar"
                  ? "rtl"
                  : "ltr";
            }
          } catch (_) {}
        }

        return shouldRestore ? remote : null;

      } catch (error) {
        console.warn(
          "CX central resume deferred",
          error
        );

        return null;
      }
    }

    /*
      Replace the old timestamp-only restore logic.
    */
    window.CXCloud.restoreMyRecord =
      restoreCentralRecord;

    /*
      IMPORTANT:
      After the learner enters the SAME name and code
      from a new browser, restore their central record
      BEFORE the platform decides which screen to show.
    */
    const previousClaim =
      window.CXCloud.claimIdentity.bind(
        window.CXCloud
      );

    window.CXCloud.claimIdentity =
      async function (fullName, accessCode) {

        const result =
          await previousClaim(
            fullName,
            accessCode
          );

        await restoreCentralRecord({
          force: true
        });

        return result;
      };

    window.CXCloud.__V123ResumePatched =
      true;

    console.log(
      "CX Simulation Lab V12.3 resume active"
    );
  }

  setTimeout(install, 0);
})();
/* ============================================================
   CX Simulation Lab — V12.4 Production Hardening
   Append this block AFTER the existing V12.3 code.
   ============================================================ */
(function installCXV124(){
  'use strict';

  const isAdminPage = /\/admin\.html$/i.test(location.pathname);
  const params = new URLSearchParams(location.search);
  const isPreview = params.get('preview') === '1';
  const isAdminReport = () => !!window.CX_ADMIN_REPORT_MODE;

  /* 1) Separate Admin and Learner Supabase Auth sessions. */
  try {
    if (
      window.supabase &&
      typeof window.supabase.createClient === 'function' &&
      !window.supabase.__CX_V124_AUTH__
    ) {
      const originalCreateClient =
        window.supabase.createClient.bind(window.supabase);

      window.supabase.createClient = function(url, key, options) {
        const incoming = options || {};

        const auth = Object.assign(
          {},
          incoming.auth || {},
          {
            storageKey:
              isAdminPage
                ? 'cxlab-admin-auth-v124'
                : 'cxlab-learner-auth-v124'
          }
        );

        return originalCreateClient(
          url,
          key,
          Object.assign({}, incoming, { auth })
        );
      };

      window.supabase.__CX_V124_AUTH__ = true;
    }
  } catch (e) {
    console.warn(
      'CX V12.4 auth isolation deferred',
      e
    );
  }

  function attempts() {
    try {
      return Array.isArray(Store.data?.attempts)
        ? Store.data.attempts
        : [];
    } catch (_) {
      return [];
    }
  }

  function hasAttempt(id) {
    return attempts().some(
      a => a && a.sim === id
    );
  }

  function hasActionPlan() {
    try {
      const p = Store.data?.actionPlan;

      return !!(
        p &&
        typeof p === 'object' &&
        Object.values(p).some(
          v => String(v ?? '').trim() !== ''
        )
      );
    } catch (_) {
      return false;
    }
  }

  function coreComplete() {
    try {
      return (
        hasAttempt('baseline') &&

        Array.isArray(Store.data?.casesRead) &&
        Store.data.casesRead.length > 0 &&

        hasAttempt('expectation') &&

        Store.data?.servqualScore !== null &&
        Store.data?.servqualScore !== undefined &&

        hasAttempt('first90') &&
        hasAttempt('listen') &&
        hasAttempt('recovery') &&
        hasAttempt('angry') &&
        hasAttempt('warroom')
      );
    } catch (_) {
      return false;
    }
  }

  function postUnlocked() {
    return (
      coreComplete() &&
      hasAttempt('final') &&
      hasActionPlan()
    );
  }

  function resetAllowed() {
    return isPreview || isAdminReport();
  }

  function txt(ar, en) {
    try {
      return (
        typeof App !== 'undefined' &&
        App &&
        App.lang === 'en'
      )
        ? en
        : ar;
    } catch (_) {
      return ar;
    }
  }

  function say(s) {
    try {
      if (typeof toast === 'function') {
        toast(s);
        return;
      }
    } catch (_) {}

    alert(s);
  }

  const finalMsg = () =>
    txt(
      'لا يمكن بدء التقييم السلوكي الختامي قبل إكمال جميع الأنشطة التدريبية الإلزامية.',
      'The final behavioural assessment is locked until all mandatory learning activities are completed.'
    );

  const postMsg = () =>
    txt(
      'فجوة بعد التدريب مقفلة. أكمل الأنشطة الإلزامية ثم التقييم الختامي ثم احفظ خطة العمل.',
      'The post-training gap is locked. Complete the mandatory activities, final assessment, and action plan first.'
    );

  /* 2) Block bypass attempts from buttons. */
  if (!isAdminPage) {
    document.addEventListener(
      'click',
      e => {
        const finalBtn =
          e.target?.closest?.(
            '[data-assess="final"]'
          );

        if (
          finalBtn &&
          !coreComplete()
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();

          say(finalMsg());
          return;
        }

        const postBtn =
          e.target?.closest?.(
            '[data-kg-open="post"]'
          );

        if (
          postBtn &&
          !postUnlocked()
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();

          say(postMsg());
          return;
        }

        const resetBtn =
          e.target?.closest?.(
            '#resetBtn,#facReset'
          );

        if (
          resetBtn &&
          !resetAllowed()
        ) {
          e.preventDefault();
          e.stopImmediatePropagation();

          say(
            txt(
              'حفاظًا على سجل التعلم، لا يمكن للمتدرب مسح النتائج أو إعادة ضبط الجلسة.',
              'Learners cannot reset or erase their learning record.'
            )
          );
        }
      },
      true
    );
  }

  /* Hide learner reset controls completely. */
  if (
    !isAdminPage &&
    !isPreview
  ) {
    const st =
      document.createElement('style');

    st.textContent =
      '#resetBtn,#facReset{display:none!important}';

    document.head.appendChild(st);
  }

  /* 3) Function-level guards after the main platform code loads. */
  let tries = 0;

  function installRuntime() {
    tries++;

    if (
      typeof Store === 'undefined' ||
      !Store
    ) {
      if (tries < 300) {
        setTimeout(
          installRuntime,
          50
        );
      }

      return;
    }

    if (Store.__CX_V124__) {
      return;
    }

    if (
      typeof Store.reset === 'function'
    ) {
      const originalReset =
        Store.reset.bind(Store);

      Store.reset =
        async function() {
          if (!resetAllowed()) {
            say(
              txt(
                'إعادة ضبط سجل المتدرب غير متاحة. يمكنك الاستمرار أو مراجعة ما أنجزته.',
                'Learner reset is unavailable. Continue learning or review completed work.'
              )
            );

            return Store.data;
          }

          return originalReset();
        };
    }

    if (
      typeof window.startSim ===
      'function'
    ) {
      const originalStart =
        window.startSim;

      window.startSim =
        function(sim, level) {
          if (
            sim?.id === 'final' &&
            !coreComplete()
          ) {
            say(finalMsg());
            return;
          }

          return originalStart.apply(
            this,
            arguments
          );
        };
    }

    if (
      typeof window.go === 'function'
    ) {
      const originalGo =
        window.go;

      window.go =
        function(route, arg) {
          if (
            route === 'knowledgegap' &&
            arg === 'post' &&
            !postUnlocked()
          ) {
            say(postMsg());
            return;
          }

          return originalGo.apply(
            this,
            arguments
          );
        };
    }

    if (
      typeof window
        .knowledgePostUnlocked ===
      'function'
    ) {
      window.knowledgePostUnlocked =
        postUnlocked;
    }

    if (
      typeof window
        .finalReportReady ===
      'function'
    ) {
      window.finalReportReady =
        () =>
          coreComplete() &&
          hasAttempt('final') &&
          hasActionPlan() &&
          !!Store.data
            ?.knowledgePost
            ?.completedAt;
    }

    window.CX_V124 = {
      version: '12.4',
      coreComplete,
      postUnlocked
    };

    Store.__CX_V124__ = true;

    console.log(
      'CX Simulation Lab V12.4 Production Hardening active'
    );
  }

  setTimeout(
    installRuntime,
    0
  );
})();
/* ============================================================
   CX Simulation Lab — V12.5 PDF Pagination Fix
   Prevents designed A4 report pages from spilling into blank pages.
   ============================================================ */
(function installCXV125PdfPagination(){
  'use strict';

  let tries = 0;

  function reportPaginationBootstrap(){
    const nativePrint = window.print.bind(window);
    let printing = false;

    const delay = ms =>
      new Promise(resolve => setTimeout(resolve, ms));

    async function waitAssets(){
      try {
        if (
          document.fonts &&
          document.fonts.ready
        ) {
          await Promise.race([
            document.fonts.ready,
            delay(1800)
          ]);
        }
      } catch (_) {}

      try {
        const images =
          Array.from(document.images || []);

        await Promise.race([
          Promise.all(
            images.map(img => {
              if (img.complete) {
                return Promise.resolve();
              }

              return new Promise(resolve => {
                const done = () => resolve();

                img.addEventListener(
                  'load',
                  done,
                  { once: true }
                );

                img.addEventListener(
                  'error',
                  done,
                  { once: true }
                );
              });
            })
          ),
          delay(1800)
        ]);
      } catch (_) {}
    }

    function fitPages(){
      const pages =
        Array.from(
          document.querySelectorAll('.page')
        );

      if (!pages.length) return;

      const pxPerMm = 96 / 25.4;

      /*
        Use 294 mm rather than the full 297 mm
        to protect against Chrome PDF rounding.
      */
      const targetHeight =
        294 * pxPerMm;

      pages.forEach(page => {

        /*
          Measure the original report page first.
        */
        page.style.zoom = '1';
        page.style.width = '210mm';
        page.style.height = 'auto';
        page.style.minHeight = '297mm';
        page.style.maxHeight = 'none';
        page.style.padding =
          '13mm 15mm 11mm';
        page.style.overflow = 'hidden';

        page.style.breakAfter = 'page';
        page.style.pageBreakAfter =
          'always';

        const naturalHeight =
          Math.max(
            page.scrollHeight || 0,
            page.getBoundingClientRect()
              .height || 0
          );

        let scale =
          naturalHeight > targetHeight
            ? targetHeight /
              naturalHeight
            : 1;

        /*
          Extra safety against a 1–2 px
          overflow creating another PDF page.
        */
        if (scale < 0.997) {
          scale *= 0.992;
        }

        scale = Math.max(
          0.80,
          Math.min(1, scale)
        );

        /*
          Only pages that need fitting
          are reduced.
          The visible sheet remains A4.
        */
        if (scale < 0.997) {

          const inverse =
            1 / scale;

          page.style.zoom =
            String(scale);

          page.style.width =
            `${210 * inverse}mm`;

          page.style.height =
            `${297 * inverse}mm`;

          page.style.minHeight =
            `${297 * inverse}mm`;

          page.style.maxHeight =
            `${297 * inverse}mm`;

          page.style.padding =
            `${13 * inverse}mm ` +
            `${15 * inverse}mm ` +
            `${11 * inverse}mm`;

        } else {

          page.style.height =
            '297mm';

          page.style.minHeight =
            '297mm';

          page.style.maxHeight =
            '297mm';
        }
      });

      /*
        Never force an extra page
        after the final report page.
      */
      const last =
        pages[pages.length - 1];

      last.style.breakAfter = 'auto';
      last.style.pageBreakAfter =
        'auto';
    }

    /*
      Intercept the browser print request,
      wait for fonts/images,
      fit every designed page,
      then call Chrome's real Print.
    */
    window.print = function(){

      if (printing) return;

      printing = true;

      (async () => {

        await waitAssets();

        fitPages();

        await delay(100);

        nativePrint();

      })().catch(() => {

        nativePrint();

      });
    };
  }

  function install(){

    tries++;

    if (
      typeof window
        .buildPrintableReportHTML !==
      'function'
    ) {

      if (tries < 300) {
        setTimeout(
          install,
          50
        );
      }

      return;
    }

    if (
      window
        .__CX_V125_PDF_PAGINATION__
    ) {
      return;
    }

    const originalBuild =
      window.buildPrintableReportHTML;

    window.buildPrintableReportHTML =
      function(exportAt){

        const html =
          originalBuild.call(
            this,
            exportAt
          );

        const bootstrap =
          '<script>(' +
          reportPaginationBootstrap
            .toString() +
          ')();</script>';

        return html.includes('</body>')
          ? html.replace(
              '</body>',
              bootstrap + '</body>'
            )
          : html + bootstrap;
      };

    window
      .__CX_V125_PDF_PAGINATION__ =
      true;

    console.log(
      'CX Simulation Lab V12.5 PDF pagination fix active'
    );
  }

  setTimeout(
    install,
    0
  );
})();