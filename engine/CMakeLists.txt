# Lukuluku Look Engine: core library, test tools, OFX plugin (Resolve) and Adobe plugin (Premiere Pro).
cmake_minimum_required(VERSION 3.20)
project(LukulukuLook CXX)
set(CMAKE_CXX_STANDARD 17)
set(CMAKE_CXX_STANDARD_REQUIRED ON)
set(CMAKE_POSITION_INDEPENDENT_CODE ON)
if(NOT CMAKE_BUILD_TYPE)
  set(CMAKE_BUILD_TYPE Release)
endif()
file(READ "${CMAKE_CURRENT_SOURCE_DIR}/../package.json" PKG)
string(REGEX MATCH "\"version\": *\"([^\"]+)\"" _ "${PKG}")
set(LK_VERSION "${CMAKE_MATCH_1}")
string(REPLACE "." ";" LK_VLIST "${LK_VERSION}")
list(GET LK_VLIST 0 LK_VMAJOR)
list(GET LK_VLIST 1 LK_VMINOR)
message(STATUS "Look Engine version ${LK_VERSION}")

add_library(lukuluku_core STATIC src/look_engine.cpp)
target_include_directories(lukuluku_core PUBLIC src)
target_compile_definitions(lukuluku_core PUBLIC LUKULUKU_ENGINE_VERSION="${LK_VERSION}")
find_package(Threads REQUIRED)
target_link_libraries(lukuluku_core PUBLIC Threads::Threads)

add_executable(lkrender tools/lkrender.cpp)
target_link_libraries(lkrender lukuluku_core)
add_executable(lkpixel tools/lkpixel.cpp)
target_link_libraries(lkpixel lukuluku_core)

# ---- OFX (DaVinci Resolve, free and Studio). OpenFX headers + support library from engine/third_party/openfx
set(OFX_SDK "${CMAKE_CURRENT_SOURCE_DIR}/third_party/openfx" CACHE PATH "OpenFX repository")
if(EXISTS "${OFX_SDK}/include/ofxImageEffect.h")
  file(GLOB OFX_SUPPORT "${OFX_SDK}/Support/Library/*.cpp")
  add_library(LukulukuLook_ofx MODULE ofx/lukuluku_ofx.cpp ${OFX_SUPPORT})
  target_include_directories(LukulukuLook_ofx PRIVATE "${OFX_SDK}/include" "${OFX_SDK}/Support/include")
  target_link_libraries(LukulukuLook_ofx lukuluku_core)
  target_compile_definitions(LukulukuLook_ofx PRIVATE LK_OFX_VMAJOR=${LK_VMAJOR} LK_OFX_VMINOR=${LK_VMINOR})
  if(NOT WIN32)
    target_compile_options(LukulukuLook_ofx PRIVATE -Wno-deprecated-declarations)
  endif()
  # the OFX 1.4 support library uses pre-C++17 exception specifications
  set_target_properties(LukulukuLook_ofx PROPERTIES PREFIX "" SUFFIX ".ofx" OUTPUT_NAME "LukulukuLook" CXX_STANDARD 14)
  if(APPLE)
    set(OFX_ARCH "MacOS")
  elseif(WIN32)
    set(OFX_ARCH "Win64")
  else()
    set(OFX_ARCH "Linux-x86-64")
  endif()
  add_custom_command(TARGET LukulukuLook_ofx POST_BUILD
    COMMAND ${CMAKE_COMMAND} -E make_directory "${CMAKE_BINARY_DIR}/LukulukuLook.ofx.bundle/Contents/${OFX_ARCH}"
    COMMAND ${CMAKE_COMMAND} -E copy "$<TARGET_FILE:LukulukuLook_ofx>" "${CMAKE_BINARY_DIR}/LukulukuLook.ofx.bundle/Contents/${OFX_ARCH}/"
    COMMAND ${CMAKE_COMMAND} -E copy "${CMAKE_CURRENT_SOURCE_DIR}/ofx/Info.plist" "${CMAKE_BINARY_DIR}/LukulukuLook.ofx.bundle/Contents/Info.plist")
else()
  message(STATUS "OpenFX not found at ${OFX_SDK}: skipping the Resolve plugin (run tools/fetch_sdks.sh)")
endif()

# ---- Adobe (Premiere Pro; also loads in After Effects). Needs the After Effects SDK (Adobe login to download).
set(AE_SDK "" CACHE PATH "After Effects SDK folder (contains Examples/Headers)")
if(AE_SDK AND EXISTS "${AE_SDK}/Examples/Headers/AE_Effect.h")
  set(AEH "${AE_SDK}/Examples/Headers" "${AE_SDK}/Examples/Util" "${AE_SDK}/Examples/Headers/SP" "${AE_SDK}/Examples/Resources")
  # 1. print the PiPL numbers from the same flag definitions the plugin uses
  add_executable(pipl_values adobe/pipl_values.cpp)
  target_include_directories(pipl_values PRIVATE ${AEH} adobe)
  target_compile_definitions(pipl_values PRIVATE LK_VMAJOR=${LK_VMAJOR} LK_VMINOR=${LK_VMINOR})
  add_custom_command(OUTPUT "${CMAKE_BINARY_DIR}/lk_pipl_values.h" COMMAND pipl_values > "${CMAKE_BINARY_DIR}/lk_pipl_values.h" DEPENDS pipl_values adobe/lk_flags.h)
  add_custom_target(pipl_header DEPENDS "${CMAKE_BINARY_DIR}/lk_pipl_values.h")
  # 2. the plug-in
  add_library(LukulukuLook_ae MODULE adobe/lukuluku_ae.cpp "${AE_SDK}/Examples/Util/AEFX_SuiteHelper.c")
  set_source_files_properties("${AE_SDK}/Examples/Util/AEFX_SuiteHelper.c" PROPERTIES LANGUAGE CXX)
  add_dependencies(LukulukuLook_ae pipl_header)
  target_include_directories(LukulukuLook_ae PRIVATE ${AEH} adobe "${CMAKE_BINARY_DIR}")
  target_link_libraries(LukulukuLook_ae lukuluku_core)
  target_compile_definitions(LukulukuLook_ae PRIVATE LK_VMAJOR=${LK_VMAJOR} LK_VMINOR=${LK_VMINOR})
  if(APPLE)
    set_target_properties(LukulukuLook_ae PROPERTIES BUNDLE TRUE BUNDLE_EXTENSION "plugin" OUTPUT_NAME "LukulukuLook"
      MACOSX_BUNDLE_INFO_PLIST "${CMAKE_CURRENT_SOURCE_DIR}/adobe/Info.plist.in")
    target_link_libraries(LukulukuLook_ae "-framework CoreFoundation")
    add_custom_command(TARGET LukulukuLook_ae POST_BUILD
      COMMAND ${CMAKE_COMMAND} -E make_directory "$<TARGET_BUNDLE_DIR:LukulukuLook_ae>/Contents/Resources"
      COMMAND xcrun Rez -o "$<TARGET_BUNDLE_DIR:LukulukuLook_ae>/Contents/Resources/LukulukuLook.rsrc" -define __MACH__ -arch arm64 -arch x86_64
              -i "${AE_SDK}/Examples/Headers" -i "${AE_SDK}/Examples/Resources" -i "${CMAKE_CURRENT_SOURCE_DIR}/adobe" -i "${CMAKE_BINARY_DIR}"
              -useDF "${CMAKE_CURRENT_SOURCE_DIR}/adobe/LukulukuLookPiPL.r"
      COMMAND /bin/sh -c "printf eFKTFXTC > '$<TARGET_BUNDLE_DIR:LukulukuLook_ae>/Contents/PkgInfo'")
  elseif(WIN32)
    # PiPLtool turns the .r into an .rc that the resource compiler links in
    add_custom_command(OUTPUT "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rc"
      COMMAND cl /nologo /I "${AE_SDK}/Examples/Headers" /I "${CMAKE_BINARY_DIR}" /EP "${CMAKE_CURRENT_SOURCE_DIR}/adobe/LukulukuLookPiPL.r" > "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rr"
      COMMAND "${AE_SDK}/Examples/Resources/PiPLtool.exe" "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rr" "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rrc"
      COMMAND cl /nologo /D MSWindows /EP "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rrc" > "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rc"
      DEPENDS adobe/LukulukuLookPiPL.r "${CMAKE_BINARY_DIR}/lk_pipl_values.h")
    target_sources(LukulukuLook_ae PRIVATE "${CMAKE_BINARY_DIR}/LukulukuLookPiPL.rc")
    set_target_properties(LukulukuLook_ae PROPERTIES SUFFIX ".aex" OUTPUT_NAME "LukulukuLook")
  endif()
else()
  message(STATUS "After Effects SDK not set (-DAE_SDK=...): skipping the Premiere Pro effect")
endif()
