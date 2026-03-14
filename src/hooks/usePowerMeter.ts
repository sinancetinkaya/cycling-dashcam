import { useState, useRef, useCallback } from 'react';
import { logger } from '../utils/logger';

const PM_DEVICE_ID_KEY = 'dashcam_pm_device_id';

export function usePowerMeter() {
  const [power, setPower] = useState<number | null>(null);
  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const deviceRef = useRef<any>(null);
  const powerHistoryRef = useRef<number[]>([]);

  const handleDisconnect = useCallback(() => {
    setIsConnected(false);
    setPower(null);
    powerHistoryRef.current = [];
  }, []);

  const connectToDevice = async (device: any) => {
    deviceRef.current = device;
    device.removeEventListener('gattserverdisconnected', handleDisconnect);
    device.addEventListener('gattserverdisconnected', handleDisconnect);

    let server = null;
    for (let i = 0; i < 3; i++) {
      try {
        server = await device.gatt.connect();
        break;
      } catch (err) {
        console.warn(`GATT connect attempt ${i + 1} failed`, err);
        await new Promise(resolve => setTimeout(resolve, 1000));
      }
    }
    
    if (!server) throw new Error("Could not connect to GATT server");

    const service = await server.getPrimaryService('cycling_power');
    const characteristic = await service.getCharacteristic('cycling_power_measurement');

    await characteristic.startNotifications();
    characteristic.addEventListener('characteristicvaluechanged', (event: any) => {
      const value = event.target.value;
      // Flags are 16 bits (bytes 0-1)
      // Instantaneous Power is Sint16 (bytes 2-3)
      const currentPower = value.getInt16(2, true);
      
      powerHistoryRef.current.push(currentPower);
      if (powerHistoryRef.current.length > 3) powerHistoryRef.current.shift();
      const avgPower = Math.round(powerHistoryRef.current.reduce((a, b) => a + b, 0) / powerHistoryRef.current.length);
      
      setPower(avgPower);
    });

    localStorage.setItem(PM_DEVICE_ID_KEY, device.id);
    setIsConnected(true);
    setError(null);
  };

  const connect = useCallback(async (options?: { autoConnectOnly?: boolean }) => {
    const autoConnectOnly = options?.autoConnectOnly === true;
    const log = (msg: string) => {
      logger.log('PM', msg);
    };

    try {
      setError(null);
      setIsConnecting(true);
      log("Init connect...");
      
      if (!(navigator as any).bluetooth) {
        throw new Error("Web Bluetooth is not supported in this browser.");
      }

      // 0. Try in-memory device first (if reconnecting without reload)
      if (deviceRef.current) {
        try {
          log("Trying in-memory device...");
          await connectToDevice(deviceRef.current);
          log("In-memory connected!");
          return;
        } catch (e: any) {
          log(`In-memory failed: ${e.message}`);
        }
      }

      // 1. Try to use previously permitted devices (Skips the browser popup!)
      let autoConnected = false;
      const savedDeviceId = localStorage.getItem(PM_DEVICE_ID_KEY);
      log(`Saved ID: ${savedDeviceId || 'none'}`);
      
      if (savedDeviceId && typeof (navigator as any).bluetooth.getDevices === 'function') {
        const devices = await (navigator as any).bluetooth.getDevices();
        log(`getDevices() found ${devices.length} devices`);
        
        const targetDevice = devices.find((d: any) => d.id === savedDeviceId);
        
        if (targetDevice) {
          log(`Trying saved device: ${targetDevice.name || targetDevice.id}`);
          try {
            if (typeof targetDevice.watchAdvertisements === 'function') {
              log(`Watching advertisements...`);
              await targetDevice.watchAdvertisements().catch((e: any) => log(`watchAdv err: ${e.message}`));
            }
            await connectToDevice(targetDevice);
            log(`Auto-connected!`);
            autoConnected = true;
          } catch (e: any) {
            log(`Auto-connect failed: ${e.message}`);
            if (targetDevice.gatt?.connected) {
              targetDevice.gatt.disconnect();
            }
          }
        } else {
          log(`Saved device not found in permitted devices.`);
        }
      } else if (!savedDeviceId) {
        log(`No saved device ID found, skipping auto-connect.`);
      } else {
        log(`getDevices() not supported`);
      }

      if (!autoConnected) {
        if (autoConnectOnly) {
          log(`Auto-connect only mode, skipping requestDevice.`);
          setIsConnecting(false);
          return;
        }
        log(`Falling back to requestDevice...`);
        const device = await (navigator as any).bluetooth.requestDevice({
          filters: [{ services: ['cycling_power'] }]
        });
        log(`requestDevice success, connecting...`);
        await connectToDevice(device);
        log(`Connected via requestDevice!`);
      }
    } catch (err: any) {
      console.error("BLE Error:", err);
      setError(err.message || "Failed to connect to power meter");
    } finally {
      setIsConnecting(false);
    }
  }, [handleDisconnect]);

  const disconnect = useCallback(() => {
    if (deviceRef.current && deviceRef.current.gatt?.connected) {
      deviceRef.current.gatt.disconnect();
    }
    setIsConnected(false);
    setPower(null);
  }, []);

  return { power, connect, disconnect, isConnected, isConnecting, error };
}
