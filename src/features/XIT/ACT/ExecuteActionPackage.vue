<script setup lang="ts">
import ActionBar from '@src/components/ActionBar.vue';
import PrunButton from '@src/components/PrunButton.vue';
import Header from '@src/components/Header.vue';
import { ActionRunner } from '@src/features/XIT/ACT/runner/action-runner';
import { useTile } from '@src/hooks/use-tile';
import { Logger, LogTag, LogContent } from '@src/features/XIT/ACT/runner/logger';
import LogWindow from '@src/features/XIT/ACT/LogWindow.vue';
import ConfigWindow from '@src/features/XIT/ACT/ConfigureWindow.vue';
import { ActionPackageConfig, ActionStep } from '@src/features/XIT/ACT/shared-types';
import { act } from '@src/features/XIT/ACT/act-registry';

const {
  pkg,
  preparePackage,
  extraConfigValid = true,
  fitShipStore,
  afterExecute,
  extraSteps,
  defaultConfig,
} = defineProps<{
  pkg: UserData.ActionPackageData;
  preparePackage?: (config: ActionPackageConfig) => {
    pkg?: UserData.ActionPackageData;
    error?: string;
  };
  extraConfigValid?: boolean | ((config: ActionPackageConfig) => boolean);
  fitShipStore?: PrunApi.Store;
  afterExecute?: (
    config: ActionPackageConfig,
    log: (tag: LogTag, message: LogContent) => void,
  ) => void;
  extraSteps?: ActionStep[];
  defaultConfig?: ActionPackageConfig;
}>();

const tile = useTile();
let goingToSplit = ref(false);

defineSlots<{ extra(props: { config: ActionPackageConfig }): unknown }>();

const config = ref(
  structuredClone(
    defaultConfig ?? {
      materialGroups: {},
      actions: {},
    },
  ),
);
const isExtraConfigValid = computed(() =>
  typeof extraConfigValid === 'function' ? extraConfigValid(config.value) : extraConfigValid,
);

const log = ref([] as { tag: LogTag; message: LogContent }[]);
const logScrolling = ref(true);
const isPreviewing = ref(false);
const isRunning = ref(false);
const status = ref(undefined as string | undefined);
const actReady = ref(false);
const skipReady = ref(false);

watch(config, clearLog, { deep: true });

watchEffect(() => {
  for (const name of pkg.groups.map(x => x.name!)) {
    config.value.materialGroups[name] ??= {};
  }
  for (const name of pkg.actions.map(x => x.name!)) {
    config.value.actions[name] ??= {};
  }
});

const needsConfigure = computed(() => {
  for (const action of pkg.actions) {
    const info = act.getActionInfo(action.type);
    if (info && info.needsConfigure?.(action)) {
      return true;
    }
  }
  for (const group of pkg.groups) {
    const info = act.getMaterialGroupInfo(group.type);
    if (info && info.needsConfigure?.(group)) {
      return true;
    }
  }
  return false;
});

const isValidConfig = computed(() => {
  for (const action of pkg.actions) {
    const info = act.getActionInfo(action.type);
    let actionConfig = config.value.actions[action.name!] ?? {};
    const isValid = info?.isValidConfig?.(action, actionConfig) ?? true;
    if (!isValid) {
      return false;
    }
  }
  for (const group of pkg.groups) {
    const info = act.getMaterialGroupInfo(group.type);
    let groupConfig = config.value.materialGroups[group.name!] ?? {};
    const isValid = info?.isValidConfig?.(group, groupConfig) ?? true;
    if (!isValid) {
      return false;
    }
  }
  return true;
});

const showConfigure = ref(true);

const shouldShowConfigure = computed(() => {
  return needsConfigure.value && (!isValidConfig.value || showConfigure.value);
});

const runner = new ActionRunner({
  tile,
  log: new Logger(logMessage),
  onBufferSplit: () => (goingToSplit.value = true),
  onStart: () => (isRunning.value = true),
  onEnd: () => {
    isRunning.value = false;
    status.value = undefined;
    afterExecute?.(config.value, logMessage);
  },
  onStatusChanged: (title, keepReady) => {
    status.value = title;
    if (!keepReady) {
      actReady.value = false;
      skipReady.value = false;
    }
  },
  onActReady: () => {
    actReady.value = true;
  },
  onSkipReady: () => {
    skipReady.value = true;
  },
});

function onConfigureApplyClick() {
  if (!isExtraConfigValid.value) {
    return;
  }
  showConfigure.value = false;
}

function onConfigureClick() {
  showConfigure.value = true;
}

async function onPreviewClick() {
  logScrolling.value = false;
  clearLog();
  const prepared = preparePackage?.(config.value);
  if (prepared?.error || (prepared && !prepared.pkg)) {
    logMessage('ERROR', prepared.error ?? 'Could not prepare the action package');
    return;
  }
  isPreviewing.value = true;
  await runner.preview(prepared?.pkg ?? pkg, config.value, extraSteps);
  isPreviewing.value = false;
  status.value = undefined;
}

function onExecuteClick() {
  logScrolling.value = true;
  clearLog();
  const prepared = preparePackage?.(config.value);
  if (prepared?.error || (prepared && !prepared.pkg)) {
    logMessage('ERROR', prepared.error ?? 'Could not prepare the action package');
    return;
  }
  actReady.value = false;
  skipReady.value = false;
  runner.execute(prepared?.pkg ?? pkg, config.value, extraSteps);
}

function onCancelClick() {
  actReady.value = false;
  skipReady.value = false;
  runner.cancel();
}

function onActClick() {
  actReady.value = false;
  skipReady.value = false;
  runner.act();
}

function onSkipClick() {
  actReady.value = false;
  skipReady.value = false;
  runner.skip();
}

function logMessage(tag: LogTag, message: LogContent) {
  return log.value.push({ tag, message });
}

function clearLog() {
  log.value.length = 0;
}
</script>

<template>
  <div v-if="goingToSplit" />
  <div v-else :class="$style.root">
    <Header :class="$style.header">{{ pkg.global.name }}</Header>
    <ConfigWindow
      v-if="shouldShowConfigure"
      :pkg="pkg"
      :config="config"
      :fit-ship-store="fitShipStore"
      :class="$style.mainWindow">
      <template v-if="$slots.extra" #extra>
        <slot name="extra" :config="config" />
      </template>
    </ConfigWindow>
    <LogWindow v-else :messages="log" :scrolling="logScrolling" :class="$style.mainWindow" />
    <div :class="$style.status">
      <span>Status: </span>
      <span v-if="status">{{ status }}</span>
      <span v-else-if="shouldShowConfigure">Configure group parameters ↑</span>
      <span v-else>Press Execute to start</span>
    </div>
    <ActionBar :class="$style.actionBar">
      <template v-if="shouldShowConfigure">
        <PrunButton
          primary
          :disabled="!isValidConfig || !isExtraConfigValid"
          @click="onConfigureApplyClick">
          APPLY
        </PrunButton>
      </template>
      <template v-else-if="isPreviewing">
        <PrunButton v-if="needsConfigure" primary @click="onConfigureClick">CONFIGURE</PrunButton>
        <PrunButton disabled>PREVIEW</PrunButton>
        <PrunButton disabled>EXECUTE</PrunButton>
      </template>
      <template v-else-if="!isRunning">
        <PrunButton v-if="needsConfigure" primary @click="onConfigureClick">CONFIGURE</PrunButton>
        <PrunButton primary :disabled="!isExtraConfigValid" @click="onPreviewClick"
          >PREVIEW</PrunButton
        >
        <PrunButton
          primary
          :disabled="!isExtraConfigValid"
          :class="$style.executeButton"
          @click="onExecuteClick">
          EXECUTE
        </PrunButton>
      </template>
      <template v-else>
        <PrunButton v-if="needsConfigure" primary disabled>CONFIGURE</PrunButton>
        <PrunButton primary disabled>PREVIEW</PrunButton>
        <PrunButton
          danger
          :disabled="!actReady && !skipReady"
          :class="$style.executeButton"
          @click="onCancelClick">
          CANCEL
        </PrunButton>
        <PrunButton primary :disabled="!actReady" @click="onActClick">ACT</PrunButton>
        <PrunButton neutral :disabled="!actReady && !skipReady" @click="onSkipClick">
          SKIP
        </PrunButton>
      </template>
    </ActionBar>
  </div>
</template>

<style module>
.root {
  height: 100%;
  display: flex;
  flex-direction: column;
}

.mainWindow {
  flex-grow: 1;
}

.header {
  margin-left: 4px;
}

.status {
  margin-left: 5px;
  margin-top: 5px;
}

.actionBar {
  margin-left: 2px;
  justify-content: flex-start;
  user-select: none;
}

/* Use the same width for cancel and execute buttons to keep layout stable. */
.executeButton {
  width: 68px;
}
</style>
