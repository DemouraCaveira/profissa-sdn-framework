find_package(PkgConfig)

PKG_CHECK_MODULES(PC_GR_SND_FRAMEWOK gnuradio-snd_framewok)

FIND_PATH(
    GR_SND_FRAMEWOK_INCLUDE_DIRS
    NAMES gnuradio/snd_framewok/api.h
    HINTS $ENV{SND_FRAMEWOK_DIR}/include
        ${PC_SND_FRAMEWOK_INCLUDEDIR}
    PATHS ${CMAKE_INSTALL_PREFIX}/include
          /usr/local/include
          /usr/include
)

FIND_LIBRARY(
    GR_SND_FRAMEWOK_LIBRARIES
    NAMES gnuradio-snd_framewok
    HINTS $ENV{SND_FRAMEWOK_DIR}/lib
        ${PC_SND_FRAMEWOK_LIBDIR}
    PATHS ${CMAKE_INSTALL_PREFIX}/lib
          ${CMAKE_INSTALL_PREFIX}/lib64
          /usr/local/lib
          /usr/local/lib64
          /usr/lib
          /usr/lib64
          )

include("${CMAKE_CURRENT_LIST_DIR}/gnuradio-snd_framewokTarget.cmake")

INCLUDE(FindPackageHandleStandardArgs)
FIND_PACKAGE_HANDLE_STANDARD_ARGS(GR_SND_FRAMEWOK DEFAULT_MSG GR_SND_FRAMEWOK_LIBRARIES GR_SND_FRAMEWOK_INCLUDE_DIRS)
MARK_AS_ADVANCED(GR_SND_FRAMEWOK_LIBRARIES GR_SND_FRAMEWOK_INCLUDE_DIRS)
