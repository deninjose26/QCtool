export const getDeviceId = (): string => {
    let deviceId = localStorage.getItem('qc_device_id');
    if (!deviceId) {
        deviceId = `dev_${Math.random().toString(36).substring(2, 11)}_${Date.now().toString(36)}`;
        localStorage.setItem('qc_device_id', deviceId);
    }
    return deviceId;
};

export const getDeviceInfo = () => {
    const ua = navigator.userAgent;
    let browser = "Unknown";
    if (ua.indexOf("Firefox") > -1) browser = "Firefox";
    else if (ua.indexOf("SamsungBrowser") > -1) browser = "Samsung Browser";
    else if (ua.indexOf("Opera") > -1 || ua.indexOf("OPR") > -1) browser = "Opera";
    else if (ua.indexOf("Trident") > -1) browser = "Internet Explorer";
    else if (ua.indexOf("Edge") > -1) browser = "Edge";
    else if (ua.indexOf("Chrome") > -1) browser = "Chrome";
    else if (ua.indexOf("Safari") > -1) browser = "Safari";

    let os = "Unknown";
    if (ua.indexOf("Win") > -1) os = "Windows";
    else if (ua.indexOf("Mac") > -1) os = "MacOS";
    else if (ua.indexOf("X11") > -1) os = "UNIX";
    else if (ua.indexOf("Linux") > -1) os = "Linux";

    return {
        browser,
        os,
        hostname: "Web Browser",
        device_id: getDeviceId()
    };
};
