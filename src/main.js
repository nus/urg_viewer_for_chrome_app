/*
 * Copyright (C) 2016 Yota Ichino
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *     http://www.apache.org/licenses/LICENSE-2.0
 *
 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 */

var urg = null;
var intervalHandler = null;
var deviceListElem = null;
var connectDeviceElem = null;
var disconnectDeviceElem = null;

window.onload = function() {
  deviceListElem = document.querySelector('#device-list');
  connectDeviceElem = document.querySelector('#connect-device');
  disconnectDeviceElem = document.querySelector('#disconnect-device');

  console.assert(deviceListElem !== null);
  console.assert(connectDeviceElem !== null);
  console.assert(disconnectDeviceElem !== null);

  Serial.getDevices(function (devices) {
    console.log(devices);
    if (devices.length === 0) {
      console.log('There are no devices.');
      return;
    }

    deviceListElem.innerHTML = '';
    for (let i = 0, len = devices.length; i < len; i++) {
      let optElem = document.createElement('option');
      optElem.value = devices[i].path;
      optElem.text = devices[i].displayName + '(' + devices[i].path + ')';
      deviceListElem.appendChild(optElem);
    }

    deviceListElem.disabled = false;
    connectDeviceElem.disabled = false;
    disconnectDeviceElem.disabled = true;
  });

  connectDeviceElem.addEventListener('click', function() {
    let devPath = deviceListElem.value;
    if (devPath === null || devPath === '') {
      console.log('Failed connect by device is empty.');
      return;
    }

    deviceListElem.disabled = true;
    connectDeviceElem.disabled = true;
    disconnectDeviceElem.disabled = false;

    urg = new Urg(devPath);
    urg.connect(onConnected);
  });

  disconnectDeviceElem.addEventListener('click', function() {
    console.assert((urg !== null), 'urg must be not null');

    urg.disconnect(function(result) {
      console.log('disconection is ' + result);

      urg = null;

      deviceListElem.disabled = false;
      connectDeviceElem.disabled = false;
      disconnectDeviceElem.disabled = true;
    });

    window.clearInterval(intervalHandler);
  });

  window.addEventListener('resize', onResizedWindow);
};

function drawUrgData(urg, data) {
  let wrapperElem = document.querySelector('#canvas-wrapper');
  let canvasElem = document.querySelector('#urg-canvas');
  if ((canvasElem === null) || (canvasElem.getContext === null)) {
    console.log('Unexpected canvas element.');
    return;
  }

  canvasElem.width = wrapperElem.clientWidth;
  canvasElem.height = wrapperElem.clientHeight;

  var ctx = canvasElem.getContext('2d');
  ctx.setTransform(0, -1, 1, 0, canvasElem.width / 2, canvasElem.height / 2);
  ctx.beginPath();

  let angleStep = 360 / 1024;
  let frontIndex = 384;
  for (let i = 0, size = data.length; i < size; i++) {
    let length = data[i] / 10;
    if (length < 0) {
      // Error value.
      continue;
    }

    let rad = (i - frontIndex) * ((2 * Math.PI) / 1024);
    let x =  length * Math.cos(rad);
    let y = -length * Math.sin(rad);
    ctx.moveTo(0, 0);
    ctx.lineTo(x, y);
  }
  ctx.closePath();
  ctx.stroke();
}

function onConnected(result) {
  console.log('onConnected');
  console.log(result);

  if (result) {
    // TODO disable select and connect button.
    intervalHandler = window.setInterval(function() {
      urg.captureOnce(function(data) {
        if (data === null) {
          console.log('Failed to urg.captureOnce.');
          return;
        }

        drawUrgData(urg, data);
      }, function() {
        console.log('Failed to urg.captureOnce while capturing.');
      });
    }, 500);
  } else {
    urg = null;
  }
}

function onResizedWindow(e) {
  console.log(e);
  let wrapperElem = document.querySelector('#canvas-wrapper');
  let canvasElem = document.querySelector('#urg-canvas');

  canvasElem.width = wrapperElem.clientWidth;
  canvasElem.height = wrapperElem.clientHeight;
}

class Serial {
  constructor(path, options) {
    this.path = path;
    this.options = options;
    this.connectionInfo = null;

    this._onReceivedCallback = null;
    this._onReceivedErrorCallback = null;
  }

  static getDevices(callback) {
    chrome.serial.getDevices(callback);
  }

  connect(onConnectedCallback) {
    let that = this;

    chrome.serial.connect(this.path, this.options, function(connectionInfo) {
      that.connectionInfo = connectionInfo;
      if (onConnectedCallback !== null) {
        onConnectedCallback();
      }
    });
  }

  disconnect(onDisconnectedCallback) {
    let that = this;

    chrome.serial.disconnect(this.connectionInfo.connectionId, function(result) {
      that.stopReceiving();
      if (onDisconnectedCallback !== null) {
        that.connectionInfo = null;
        onDisconnectedCallback(result);
      }
    });
  }

  startReceiving(onReceivedCallback, onReceivedErrorCallback) {

    chrome.serial.onReceive.addListener(onReceivedCallback);

    if (onReceivedErrorCallback !== null) {
      chrome.serial.onReceiveError.addListener(onReceivedErrorCallback);
    }

    this._onReceivedCallback = onReceivedCallback;
    this._onReceivedErrorCallback = onReceivedErrorCallback;
  }

  stopReceiving() {
    if (chrome.serial.onReceive.hasListener(this._onReceivedCallback)) {
      chrome.serial.onReceive.removeListener(this._onReceivedCallback);
    }

    if (chrome.serial.onReceive.hasListener(this._onReceivedErrorCallback)) {
      chrome.serial.onReceive.removeListener(this._onReceivedErrorCallback);
    }

    this._onReceivedCallback = null;
    this._onReceivedErrorCallback = null;
  }

  send(buffer, sentCallback) {
    chrome.serial.send(this.connectionInfo.connectionId, buffer, function(result) {
      sentCallback(result);
    });
  }

  flush(flushCallback) {
    chrome.serial.flush(this.connectionInfo.connectionId, function(result) {
      if (flushCallback !== null) {
        flushCallback(result);
      }
    });
  }

  static stringToBuffer(s) {
    let arr = new Uint8Array(s.length);
    for (let i = 0, len = s.length; i < len; i++) {
      arr[i] = s.charCodeAt(i);
    }

    return arr.buffer;
  }

  static bufferToString(b) {
    return String.fromCharCode.apply(null, new Uint8Array(b));
  }
}

// Receiveing state after sent command.
const URG_RECEIVE_STATE_NONE = 0;
const URG_RECEIVE_STATE_SCIP20 = 1;
const URG_RECEIVE_STATE_BM = 2;
const URG_RECEIVE_STATE_QT = 3;
const URG_RECEIVE_STATE_PP = 4;
const URG_RECEIVE_STATE_GD = 5;

class Urg {
  constructor(path, bitrate=19200) {
    this._serial = new Serial(path, {
      'bitrate': bitrate,
      'parityBit': 'no',
    });
  }

  connect(onConnected) {
    this._initMembers();

    this._onConnected = onConnected;
    this._serial.connect(this._onSerialConnected.bind(this));
  }

  disconnect(onDisconnected) {
    let that = this;
    this.setLaser(false, function(result) {
      that._serial.disconnect(onDisconnected);
    });
  }

  captureOnce(onCapturedOnce, onCapturedOnceFailed) {
    if (onCapturedOnce === null) {
      console.error('onCaptureOnce must be a function.');
    } else if (onCapturedOnceFailed === null) {
      console.error('onCaptureOnce must be a function.');
    }

    let that = this;
    this._onCapturedOnce = onCapturedOnce;
    this._onCapturedOnceFailed = onCapturedOnceFailed;

    this.setLaser(true, function(result) {
      console.log('setLaser ' + result);

      that._captureCommand = that._makeGdCommand();
      that._bytesPerLength = 3;
      that._remainingDistanceLines = (that._indexMax - that._indexMin) + 1;

      that._rawLengthData = '';

      that._receiveState = URG_RECEIVE_STATE_GD;
      that._serial.send(Serial.stringToBuffer(that._captureCommand + '\n'), function(result) {
        if (!result) {
          console.log('Failed to send GD command.');
          that._onCapturedOnceFailed();
          this._onCapturedOnce = null;
          that._onCapturedOnceFailed = null;
        }
      });
    });
  }

  setLaser(onOff, onSet) {
    if (this._isLaserOn === onOff) {
      onSet(true);
      return;
    }

    let cmd = null;
    if (onOff) {
      // Turn on the laser.
      this._receiveState = URG_RECEIVE_STATE_BM;
      cmd = Serial.stringToBuffer('BM\n');
    } else {
      this._receiveState = URG_RECEIVE_STATE_QT;
      cmd = Serial.stringToBuffer('QT\n');
    }

    let that = this;
    this._onSet = onSet;
    this._serial.send(cmd, function(result) {
      if (!result) {
        console.log('failed to send');
        that._onSet(false);
        that._onSet = null;
      }
    });
  }

  _initMembers() {
    this._receiveState = URG_RECEIVE_STATE_NONE;

    this._isLaserOn = false;
    this._captureCommand = '';

    this._bytesPerLength = 3; //  距離データ当たりのバイト数
    this._remainingDistanceLines = -1; // 1スキャン当たりの距離データ数
    this._rawLengthData = null; // デーコードする前の距離データ
    this._lengthData = null; // デコード後の距離データ。頻繁にメモリ確保を避けるために用意。
    this._lengthDataCursor = -1; // _lengthData の書き込み位置

    this._model = null; // センサ型式情報
    this._distanceMin = -1; // 最小計測可能距離 (mm)
    this._distanceMax = -1; // 最大計測可能距離 (mm)
    this._angularResolution = -1; // 角度分解能(360度の分割数)
    this._indexMin = -1; // 最小計測可能方向値
    this._indexMax = -1; // 最大計測可能方向値
    this._indexFront = -1; // 正面方向値
    this._angularVelocity = -1;// 標準操作角速度
  }

  _findResponseBodyPosition(responseString, command, expected) {
    if (!responseString.startsWith(command)) {
      return -1;
    }

    let resultStart = command.length + 1 /* \n */;
    let resultEnd = resultStart + 3;
    let result = responseString.slice(resultStart, resultEnd);
    for (let i = 0, len = expected.length; i < len; i++) {
      if (result === expected[i]) {
        return resultEnd + 1;
      }
    }

    return -1;
  }

  _makeGdCommand() {
    let start = '' + this._indexMin;
    start = Array(5 - start.length).join('0') + start;
    let end = '' + this._indexMax;
    end = Array(5 - end.length).join('0') + end;

    return 'GD' + start + end + '01';
  }

  _parseResponsePp(str) {
    let pos = this._findResponseBodyPosition(str, 'PP', ['00P']);
    if (pos === -1) {
      return false;
    }

    let lines = str.split('\n');
    for (let i = 0, len = lines.length; i < len; i++) {
      let line = lines[i];
      let key = line.slice(0, 5);
      let value = line.slice(5, -2);

      if (key === 'MODL:') {
        this._model = value;
      } else if (key === 'DMIN:') {
        this._distanceMin = parseInt(value);
      } else if (key === 'DMAX:') {
        this._distanceMax = parseInt(value);
      } else if (key === 'ARES:') {
        this._angularResolution = parseInt(value);
      } else if (key === 'AMIN:') {
        this._indexMin = parseInt(value);
      } else if (key === 'AMAX:') {
        this._indexMax = parseInt(value);
      } else if (key === 'AFRT:') {
        this._indexFront = parseInt(value);
      } else if (key === 'SCAN:') {
        this._angularVelocity = parseInt(value);
      }
    }

    return true;
  }

  _parseResponseGd(str) {
    /* State of being while capturing length data.
    GD0044072501    // URG_CAPTURE_STATE_COMMAND
    00P             // URG_CAPTURE_STATE_RESULT
    0DKO>           // URG_CAPTURE_STATE_TIMESTAMP
    00i00i00i00i... // URG_CAPTURE_STATE_LENGTH
    */
    const URG_CAPTURE_STATE_COMMAND = 0;
    const URG_CAPTURE_STATE_RESULT = 1;
    const URG_CAPTURE_STATE_TIMESTAMP = 2;
    const URG_CAPTURE_STATE_LENGTH = 3;
    let captureState = URG_CAPTURE_STATE_COMMAND;

    var carryOver = null;
    let lines = str.split('\n');
    for (let i = 0, len = lines.length - 2; i < len; i++) {
      let line = lines[i];

      switch(captureState) {
        case URG_CAPTURE_STATE_COMMAND:
          if (line === this._captureCommand) {
            captureState = URG_CAPTURE_STATE_RESULT;
          } else {
            console.log('Capture command must be "' + this._captureCommand + '" but "' + line + '"');
            return false;
          }
          break;
        case URG_CAPTURE_STATE_RESULT:
          if (line === '00P') {
            captureState = URG_CAPTURE_STATE_TIMESTAMP;
          } else {
            console.log('Failed to capture command with result "' + line + '"');
            return false;
          }
          break;
        case URG_CAPTURE_STATE_TIMESTAMP:
          // TODO parse time stamp.

          if ((this._lengthData === null) ||
              (this._lengthData.length !== this._indexMax)) {
            this._lengthData = new Array(this._indexMax);
          }

          this._lengthData.fill(-1);
          this._lengthDataCursor = this._indexMin;

          captureState = URG_CAPTURE_STATE_LENGTH;
          break;
        case URG_CAPTURE_STATE_LENGTH:
          carryOver = this._parseLength(line, carryOver);
          break;
        default:
          console.log('Unexpected captureState: ' + captureState);
          return false;
      }
    }

    return true;
  }

  _parseLength(rawLine, carryOver) {
    let lineIsValid = this._checksumLine(rawLine);

    if (carryOver !== null) {
      rawLine = carryOver + rawLine;
    }

    let mod = ((rawLine.length - 1) % this._bytesPerLength);
    let co = null;
    if (mod !== 0) {
      co = rawLine.substr(rawLine.length - 1 - mod, mod);
    }

    if (lineIsValid) {
      for (let i = 0, len = (rawLine.length - 1 - mod); i < len; i += this._bytesPerLength) {
        let length = this._decodeLength(rawLine, i, this._bytesPerLength);
        this._lengthData[this._lengthDataCursor] = length;

        this._lengthDataCursor++;
      }

      return co;
    } else {
      console.log('Failed to this._checksumLine(' + rawLine + ')');

      for (let i = 0, len = (rawLine.length - 1 - mod) / this._bytesPerLength; i < len; i++) {
        this._lengthData[this._lengthDataCursor++] = -1;
      }
      return co;
    }
  }

  _checksumLine(line) {
    let sum = 0;

    for (let i = 0, len = (line.length - 1); i < len; i++) {
        sum += line.charCodeAt(i);
    }

    // Refer to the SCIP specification for details
    return ((sum & 0x3f) + 0x30) === line.charCodeAt(line.length - 1);
  }

  _decodeLength(str, start, byte) {
    let ret = 0;

    for (let i = start, len = start + byte; i < len; i++) {
      ret <<= 6;
      ret &= ~0x3f;
      ret |= str.charCodeAt(i) - 0x30;
    }

    return ret;
  }

  _onSerialConnected(connectionInfo) {
    if (this._onConnected !== null) {
      this._serial.startReceiving(
        this._onReceivedData.bind(this),
        this._onReceivedError.bind(this));

      let that = this;
      this._receiveState = URG_RECEIVE_STATE_SCIP20;
      this._serial.send(Serial.stringToBuffer('SCIP2.0\n'), function(result) {
        if (!result) {
          console.log('failed to send');
          that._onConnected(false);
          that._onConnected = null;
        }
      });
    }
  }

  _onReceivedData(info) {
    let str = (Serial.bufferToString(info.data));

    switch(this._receiveState) {
      case URG_RECEIVE_STATE_SCIP20:
        {
          let succeeded = (this._findResponseBodyPosition(str, 'SCIP2.0', ['00P', '0Ee']) > 0);
          if (succeeded) {
            var that = this;

            this._receiveState = URG_RECEIVE_STATE_PP;
            this._serial.send(Serial.stringToBuffer('PP\n'), function(result) {
              if (!result) {
                console.log('failed to send');
                that._onConnected(false);
                that._onConnected = null;
              }
            });
          } else {
            this._onConnected(false);
            this._onConnected = null;
          }
        }
        break;
      case URG_RECEIVE_STATE_PP:
        this._onConnected(this._parseResponsePp(str));
        this._onConnected = null;
        break;
      case URG_RECEIVE_STATE_BM:
        this._isLaserOn = (this._findResponseBodyPosition(str, 'BM', ['00P', '02R']) > 0);
        this._onSet(true);
        this._onSet = null;
        break;
      case URG_RECEIVE_STATE_QT:
        console.log(str);
        this._isLaserOn = (this._findResponseBodyPosition(str, 'QT', ['00P', '02R']) > 0);
        this._onSet(true);
        this._onSet = null;
        break;
      case URG_RECEIVE_STATE_GD:
        {
          this._rawLengthData += str;
          let sub = this._rawLengthData.substr(this._rawLengthData.length - 2);
          if (sub === '\n\n') {
            if (this._parseResponseGd(this._rawLengthData)) {
              this._onCapturedOnce(this._lengthData);
            } else {
              this._onCapturedOnceFailed();
            }

            this._rawLengthData = null;
            this._onCapturedOnce = null;
            this._onCapturedOnceFailed = null;
          }
        }
        break;
    }
  }

  _onReceivedError(info) {
    console.log('_onReceivedError');
    console.log(info);

    // TODO Handle an event for disconnecting. info.error === 'device_lost'
  }
}
