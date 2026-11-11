@echo off

set PATH=%PATH%;%~dp0bin

set fw_ver=0x19
set fw_hex=%1%2.hex
set p_key=%~dp0priv.pem
set bl_hex=%~dp0bootloader\bl_nrf52811_xxaa_s112.hex
set sd_hex=%~dp0..\SDK\17.1.0_ddde560\components\softdevice\s112\hex\s112_nrf52_7.3.0_softdevice.hex
set settings=%1%2-settings.hex
set fw_full_hex=%1%2-full.hex
set ota_zip=%1%2-ota.zip

nrfutil pkg generate --application %fw_hex% --key-file %p_key% --hw-version 52 --sd-req 0x126 --sd-id 0x126 --application-version %fw_ver% %ota_zip%
nrfutil settings generate --family NRF52810 --application %fw_hex% --softdevice %sd_hex% --application-version %fw_ver% --bootloader-version 1 --bl-settings-version 1 --key-file %p_key% --no-backup %settings%
mergehex -m %sd_hex% %bl_hex% %fw_hex% %settings% -o %fw_full_hex%
