@echo off

set PATH=%PATH%;%~dp0bin

set fw_ver=0x19
set fw_hex=%1%2.hex
set p_key=%~dp0priv.pem
set bl_hex=%~dp0bootloader\bl_nrf51822_xxaa_s130.hex
set sd_hex=%~dp0..\SDK\12.3.0_d7731ad\components\softdevice\s130\hex\s130_nrf51_2.0.1_softdevice.hex
set settings=%1%2-settings.hex
set fw_full_hex=%1%2-full.hex
set ota_zip=%1%2-ota.zip

nrfutil pkg generate --application %fw_hex% --key-file %p_key% --hw-version 51 --sd-req 0x87 --sd-id 0x87 --application-version %fw_ver% %ota_zip%
nrfutil settings generate --family NRF51 --application %fw_hex% --softdevice %sd_hex% --application-version %fw_ver% --bootloader-version 1 --bl-settings-version 1 --key-file %p_key% --no-backup %settings%
mergehex -m %sd_hex% %bl_hex% %fw_hex% %settings% -o %fw_full_hex%
